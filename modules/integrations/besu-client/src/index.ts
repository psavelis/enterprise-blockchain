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

import consortiumRegistryArtifact from "../../../../contracts/ConsortiumOrderRegistry.json";
import type {
  PurchaseOrder,
  SharedOrderView,
} from "../../../privacy/src/domain/entities";
import {
  getOptionalEnv,
  getNumberEnv,
  getRequiredEnv,
} from "../../shared/src/env";

const consortiumInterface = new Interface(
  consortiumRegistryArtifact.abi as InterfaceAbi,
);

export interface BesuRpcProfile {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  // NOTE: sketch only — do not store key material as plain strings in production
  walletPrivateKey?: string;
  privacyGroupId?: string;
}

export interface BesuPrivateTransactionRequest {
  transaction: TransactionRequest;
  privacyGroupId: string;
}

export class BesuEthersClientSketch {
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

  createProvider(profile: BesuRpcProfile): JsonRpcProvider {
    return new JsonRpcProvider(profile.rpcUrl, profile.chainId);
  }

  createSigner(profile: BesuRpcProfile): Wallet {
    if (!profile.walletPrivateKey) {
      throw new Error("walletPrivateKey is required to create a Besu signer");
    }

    return new Wallet(profile.walletPrivateKey, this.createProvider(profile));
  }

  // Wrap a Wallet with ethers NonceManager so concurrent transactions from
  // the same account within this service instance are sequenced correctly.
  // Note: NonceManager only coordinates nonces in-process; if multiple
  // independent services share the same signing account, they still need an
  // external strategy to avoid cross-service NONCE_TOO_LOW races.
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

  // Estimate the gas required for a transaction against the target provider.
  // Returns the estimate as a bigint. Callers may pass a manual override
  // (gasLimitOverride) to skip the RPC round-trip where the cost is known.
  async estimateGas(
    profile: BesuRpcProfile,
    tx: TransactionRequest,
    gasLimitOverride?: bigint,
  ): Promise<bigint> {
    if (gasLimitOverride !== undefined) {
      return gasLimitOverride;
    }
    try {
      return await this.createProvider(profile).estimateGas(tx);
    } catch (err: unknown) {
      const anyErr = err as
        | {
            code?: unknown;
            error?: { code?: unknown };
            info?: { error?: { code?: unknown } };
          }
        | undefined;
      const rawCode =
        anyErr?.code ?? anyErr?.error?.code ?? anyErr?.info?.error?.code;
      const normalizedCode =
        typeof rawCode === "string" ? rawCode.toUpperCase() : "";
      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();

      if (
        normalizedCode === "INSUFFICIENT_FUNDS" ||
        msgLower.includes("insufficient funds")
      ) {
        throw new Error(
          `Besu gas estimation failed — sender account has insufficient funds: ${msg}`,
          { cause: err },
        );
      }
      throw new Error(`Besu gas estimation failed: ${msg}`, { cause: err });
    }
  }

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

  // Send a transaction through a NonceManager-wrapped signer.
  // Catches common Besu-specific errors and provides actionable messages.
  async sendTransaction(
    signer: NonceManager,
    tx: TransactionRequest,
  ): Promise<string> {
    try {
      const response = await signer.sendTransaction(tx);
      return response.hash;
    } catch (err: unknown) {
      const anyErr = err as
        | {
            code?: unknown;
            error?: { code?: unknown };
            info?: { error?: { code?: unknown } };
          }
        | undefined;
      const rawCode =
        anyErr?.code ?? anyErr?.error?.code ?? anyErr?.info?.error?.code;
      const normalizedCode =
        typeof rawCode === "string" ? rawCode.toUpperCase() : "";
      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();

      if (
        normalizedCode === "NONCE_TOO_LOW" ||
        msgLower.includes("nonce too low")
      ) {
        throw new Error(
          `Besu NONCE_TOO_LOW — another transaction from this account was mined first. ` +
            `Retry with a fresh nonce or use createManagedSigner() for automatic sequencing.`,
          { cause: err },
        );
      }
      if (
        normalizedCode === "INSUFFICIENT_FUNDS" ||
        msgLower.includes("insufficient funds")
      ) {
        throw new Error(
          `Besu INSUFFICIENT_FUNDS — the sender account cannot cover gas × gasPrice. ` +
            `Fund the account or lower gasLimit.`,
          { cause: err },
        );
      }
      throw err;
    }
  }
}
