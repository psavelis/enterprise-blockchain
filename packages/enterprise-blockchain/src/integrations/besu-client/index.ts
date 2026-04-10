import {
  Contract,
  Interface,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  type ContractRunner,
  type InterfaceAbi,
  type TransactionRequest,
} from "ethers";

import consortiumRegistryArtifact from "../../../../../contracts/ConsortiumOrderRegistry.json";
import type {
  PurchaseOrder,
  SharedOrderView,
} from "../../privacy/domain/entities.js";
import { getOptionalEnv, getNumberEnv, getRequiredEnv } from "../shared/env.js";
import {
  CircuitBreaker,
  BESU_RETRY_POLICY,
  BESU_NON_RETRYABLE,
  withRetry,
  type CircuitBreakerOptions,
} from "../shared/retry.js";
import {
  createTracer,
  withSpan,
  TelemetryAttributes,
} from "../../shared/telemetry.js";
import {
  extractErrorMessage,
  extractErrorCode,
  isInsufficientFunds,
  isNonceTooLow,
} from "./error-mapper.js";
import type {
  BesuPrivateTransactionRequest,
  BesuHealthStatus,
  BesuRpcProfile,
  IBesuGasEstimator,
  IBesuHealthChecker,
  IBesuProfileFactory,
  IBesuProviderFactory,
  IBesuTransactionBuilder,
  IBesuTransactionSender,
} from "./ports.js";

const tracer = createTracer("besu-client");

export type {
  BesuRpcProfile,
  BesuPrivateTransactionRequest,
  BesuHealthStatus,
} from "./ports.js";

const consortiumInterface = new Interface(
  consortiumRegistryArtifact.abi as InterfaceAbi,
);

export class BesuProfileFactory implements IBesuProfileFactory {
  createProfileFromEnv(env: NodeJS.ProcessEnv = process.env): BesuRpcProfile {
    const profile: BesuRpcProfile = {
      rpcUrl: getRequiredEnv("BESU_RPC_URL", env),
      chainId: getNumberEnv("BESU_CHAIN_ID", 1337, env),
      contractAddress: getRequiredEnv("BESU_CONTRACT_ADDRESS", env),
    };

    const walletPrivateKey = getOptionalEnv("BESU_WALLET_PRIVATE_KEY", env);
    if (walletPrivateKey) {
      profile.walletPrivateKey = walletPrivateKey;
    }

    const privacyGroupId = getOptionalEnv("BESU_PRIVACY_GROUP_ID", env);
    if (privacyGroupId) {
      profile.privacyGroupId = privacyGroupId;
    }

    return profile;
  }

  createProfile(profile: BesuRpcProfile): BesuRpcProfile {
    if (!profile.rpcUrl.startsWith("http")) {
      throw new Error("BesuRpcProfile.rpcUrl must be an HTTP(S) URL");
    }
    if (profile.chainId <= 0) {
      throw new Error("BesuRpcProfile.chainId must be a positive integer");
    }
    return profile;
  }
}

export class BesuProviderFactory implements IBesuProviderFactory {
  createProvider(profile: BesuRpcProfile): JsonRpcProvider {
    return new JsonRpcProvider(profile.rpcUrl, profile.chainId);
  }

  createSigner(profile: BesuRpcProfile): Wallet {
    if (!profile.walletPrivateKey) {
      throw new Error("walletPrivateKey is required to create a Besu signer");
    }
    return new Wallet(profile.walletPrivateKey, this.createProvider(profile));
  }

  createManagedSigner(profile: BesuRpcProfile): NonceManager {
    return new NonceManager(this.createSigner(profile));
  }

  createContract(profile: BesuRpcProfile, runner?: ContractRunner): Contract {
    const resolvedRunner = runner ?? this.createProvider(profile);
    return new Contract(
      profile.contractAddress,
      consortiumRegistryArtifact.abi as InterfaceAbi,
      resolvedRunner,
    );
  }
}

export class BesuGasEstimator implements IBesuGasEstimator {
  constructor(private readonly providerFactory: IBesuProviderFactory) {}

  async estimateGas(
    profile: BesuRpcProfile,
    tx: TransactionRequest,
    gasLimitOverride?: bigint,
  ): Promise<bigint> {
    return withSpan(tracer, "besu.estimateGas", async (span) => {
      span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "besu");
      span.setAttribute("besu.chain_id", profile.chainId);

      if (gasLimitOverride !== undefined) {
        span.setAttribute(
          "besu.gas_limit_override",
          gasLimitOverride.toString(),
        );
        return gasLimitOverride;
      }
      try {
        const gasEstimate = await this.providerFactory
          .createProvider(profile)
          .estimateGas(tx);
        span.setAttribute("besu.gas_estimate", gasEstimate.toString());
        return gasEstimate;
      } catch (err: unknown) {
        const msg = extractErrorMessage(err);
        span.setAttribute(TelemetryAttributes.ERROR_MESSAGE, msg);
        if (isInsufficientFunds(err)) {
          throw new Error(
            `Besu gas estimation failed — sender account has insufficient funds: ${msg}`,
            { cause: err },
          );
        }
        throw new Error(`Besu gas estimation failed: ${msg}`, { cause: err });
      }
    });
  }
}

export class BesuTransactionBuilder implements IBesuTransactionBuilder {
  buildAnchorOrderTransaction(
    profile: BesuRpcProfile,
    order: PurchaseOrder,
    auditProof: string,
    gasLimit?: bigint,
  ): TransactionRequest {
    const tx: TransactionRequest = {
      to: profile.contractAddress,
      chainId: profile.chainId,
      data: consortiumInterface.encodeFunctionData("anchorOrder", [
        order.id,
        order.buyer,
        order.supplier,
        auditProof,
      ]),
    };
    if (gasLimit !== undefined) {
      tx.gasLimit = gasLimit;
    }
    return tx;
  }

  buildAudienceViewTransaction(
    profile: BesuRpcProfile,
    view: SharedOrderView,
    gasLimit?: bigint,
  ): BesuPrivateTransactionRequest {
    if (!profile.privacyGroupId) {
      throw new Error(
        "privacyGroupId is required to build a Besu private transaction",
      );
    }

    const proofArg =
      typeof view.auditProof === "string"
        ? view.auditProof
        : JSON.stringify(view.auditProof);

    const tx: TransactionRequest = {
      to: profile.contractAddress,
      chainId: profile.chainId,
      data: consortiumInterface.encodeFunctionData("publishAudienceView", [
        view.orderId,
        view.audience,
        JSON.stringify(view.data),
        proofArg,
      ]),
    };
    if (gasLimit !== undefined) {
      tx.gasLimit = gasLimit;
    }

    return {
      privacyGroupId: profile.privacyGroupId,
      transaction: tx,
    };
  }
}

export class BesuTransactionSender implements IBesuTransactionSender {
  async sendTransaction(
    signer: NonceManager,
    tx: TransactionRequest,
  ): Promise<string> {
    return withSpan(tracer, "besu.sendTransaction", async (span) => {
      span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "besu");
      if (tx.to && typeof tx.to === "string") {
        span.setAttribute("besu.to", tx.to);
      }
      if (tx.chainId) span.setAttribute("besu.chain_id", Number(tx.chainId));

      try {
        const response = await signer.sendTransaction(tx);
        span.setAttribute(TelemetryAttributes.BLOCKCHAIN_TX_ID, response.hash);
        return response.hash;
      } catch (err: unknown) {
        const msg = extractErrorMessage(err);
        span.setAttribute(TelemetryAttributes.ERROR_MESSAGE, msg);

        if (isNonceTooLow(err)) {
          throw new Error(
            `Besu NONCE_TOO_LOW — another transaction from this account was mined first. ` +
              `Retry with a fresh nonce or use createManagedSigner() for automatic sequencing.`,
            { cause: err },
          );
        }
        if (isInsufficientFunds(err)) {
          throw new Error(
            `Besu INSUFFICIENT_FUNDS — the sender account cannot cover gas × gasPrice. ` +
              `Fund the account or lower gasLimit.`,
            { cause: err },
          );
        }
        throw err;
      }
    });
  }
}

export class BesuHealthChecker implements IBesuHealthChecker {
  constructor(private readonly providerFactory: IBesuProviderFactory) {}

  async checkHealth(profile: BesuRpcProfile): Promise<BesuHealthStatus> {
    return withSpan(tracer, "besu.checkHealth", async (span) => {
      span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "besu");
      span.setAttribute("besu.chain_id", profile.chainId);

      const start = Date.now();
      try {
        const provider = this.providerFactory.createProvider(profile);
        const [blockNumber, network] = await Promise.all([
          provider.getBlockNumber(),
          provider.getNetwork(),
        ]);
        const latencyMs = Date.now() - start;

        span.setAttribute("besu.healthy", true);
        span.setAttribute("besu.block_number", blockNumber.toString());
        span.setAttribute("besu.latency_ms", latencyMs);

        return {
          healthy: true,
          blockNumber: BigInt(blockNumber),
          chainId: Number(network.chainId),
          latencyMs,
        };
      } catch (err) {
        const latencyMs = Date.now() - start;
        const errorMsg = extractErrorMessage(err);

        span.setAttribute("besu.healthy", false);
        span.setAttribute("besu.latency_ms", latencyMs);
        span.setAttribute(TelemetryAttributes.ERROR_MESSAGE, errorMsg);

        return {
          healthy: false,
          latencyMs,
          error: errorMsg,
        };
      }
    });
  }
}

/**
 * Resilient Besu client with circuit breaker and retry support.
 *
 * Circuit breaker prevents cascading failures when Besu RPC is unavailable.
 * Retry policy handles transient errors (SERVER_ERROR, TIMEOUT) with backoff.
 *
 * NOTE: sketch only — do not store key material as plain strings in production
 */
export class BesuEthersClientSketch
  implements
    IBesuProfileFactory,
    IBesuProviderFactory,
    IBesuGasEstimator,
    IBesuTransactionBuilder,
    IBesuTransactionSender,
    IBesuHealthChecker
{
  private readonly profileFactory = new BesuProfileFactory();
  private readonly providerFactory = new BesuProviderFactory();
  private readonly txBuilder = new BesuTransactionBuilder();
  private readonly txSender = new BesuTransactionSender();
  private readonly healthChecker = new BesuHealthChecker(this.providerFactory);
  private readonly circuitBreaker: CircuitBreaker;

  constructor(circuitBreakerOptions?: Partial<CircuitBreakerOptions>) {
    this.circuitBreaker = new CircuitBreaker(circuitBreakerOptions, "besu-rpc");
  }

  createProfileFromEnv(env?: NodeJS.ProcessEnv): BesuRpcProfile {
    return this.profileFactory.createProfileFromEnv(env);
  }

  createProfile(profile: BesuRpcProfile): BesuRpcProfile {
    return this.profileFactory.createProfile(profile);
  }

  createProvider(profile: BesuRpcProfile): JsonRpcProvider {
    return this.providerFactory.createProvider(profile);
  }

  createSigner(profile: BesuRpcProfile): Wallet {
    return this.providerFactory.createSigner(profile);
  }

  createManagedSigner(profile: BesuRpcProfile): NonceManager {
    return this.providerFactory.createManagedSigner(profile);
  }

  createContract(profile: BesuRpcProfile, runner?: ContractRunner): Contract {
    return this.providerFactory.createContract(profile, runner);
  }

  async estimateGas(
    profile: BesuRpcProfile,
    tx: TransactionRequest,
    gasLimitOverride?: bigint,
  ): Promise<bigint> {
    if (gasLimitOverride !== undefined) {
      return gasLimitOverride;
    }

    return this.circuitBreaker.execute(() =>
      withRetry(
        async () => {
          try {
            return await this.createProvider(profile).estimateGas(tx);
          } catch (err: unknown) {
            const msg = extractErrorMessage(err);
            if (isInsufficientFunds(err)) {
              throw new Error(
                `Besu gas estimation failed — sender account has insufficient funds: ${msg}`,
                { cause: err },
              );
            }
            throw new Error(`Besu gas estimation failed: ${msg}`, {
              cause: err,
            });
          }
        },
        BESU_RETRY_POLICY,
        BESU_NON_RETRYABLE,
        extractErrorCode,
        "besu.estimateGas",
      ),
    );
  }

  buildAnchorOrderTransaction(
    profile: BesuRpcProfile,
    order: PurchaseOrder,
    auditProof: string,
    gasLimit?: bigint,
  ): TransactionRequest {
    return this.txBuilder.buildAnchorOrderTransaction(
      profile,
      order,
      auditProof,
      gasLimit,
    );
  }

  buildAudienceViewTransaction(
    profile: BesuRpcProfile,
    view: SharedOrderView,
    gasLimit?: bigint,
  ): BesuPrivateTransactionRequest {
    return this.txBuilder.buildAudienceViewTransaction(profile, view, gasLimit);
  }

  sendTransaction(
    signer: NonceManager,
    tx: TransactionRequest,
  ): Promise<string> {
    return this.txSender.sendTransaction(signer, tx);
  }

  async checkHealth(profile: BesuRpcProfile): Promise<BesuHealthStatus> {
    // Health checks bypass circuit breaker to allow probing during recovery
    return this.healthChecker.checkHealth(profile);
  }

  /** Get circuit breaker state for monitoring dashboards. */
  getCircuitBreakerHealth() {
    return this.circuitBreaker.getHealthStatus();
  }

  /** Reset circuit breaker (use after resolving underlying issues). */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}
