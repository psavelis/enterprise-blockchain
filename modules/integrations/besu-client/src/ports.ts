import type {
  Contract,
  JsonRpcProvider,
  NonceManager,
  TransactionRequest,
  Wallet,
} from "ethers";
import type {
  PurchaseOrder,
  SharedOrderView,
} from "../../../privacy/src/domain/entities";

export interface BesuRpcProfile {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  walletPrivateKey?: string;
  privacyGroupId?: string;
}

export interface BesuPrivateTransactionRequest {
  transaction: TransactionRequest;
  privacyGroupId: string;
}

export interface IBesuProfileFactory {
  createProfileFromEnv(env?: NodeJS.ProcessEnv): BesuRpcProfile;
  createProfile(profile: BesuRpcProfile): BesuRpcProfile;
}

export interface IBesuProviderFactory {
  createProvider(profile: BesuRpcProfile): JsonRpcProvider;
  createSigner(profile: BesuRpcProfile): Wallet;
  createManagedSigner(profile: BesuRpcProfile): NonceManager;
  createContract(profile: BesuRpcProfile): Contract;
}

export interface IBesuGasEstimator {
  estimateGas(
    profile: BesuRpcProfile,
    tx: TransactionRequest,
    gasLimitOverride?: bigint,
  ): Promise<bigint>;
}

export interface IBesuTransactionBuilder {
  buildAnchorOrderTransaction(
    profile: BesuRpcProfile,
    order: PurchaseOrder,
    auditProof: string,
    gasLimit?: bigint,
  ): TransactionRequest;

  buildAudienceViewTransaction(
    profile: BesuRpcProfile,
    view: SharedOrderView,
    gasLimit?: bigint,
  ): BesuPrivateTransactionRequest;
}

export interface IBesuTransactionSender {
  sendTransaction(
    signer: NonceManager,
    tx: TransactionRequest,
  ): Promise<string>;
}

export interface IBesuHealthChecker {
  checkHealth(profile: BesuRpcProfile): Promise<BesuHealthStatus>;
}

export interface BesuHealthStatus {
  healthy: boolean;
  blockNumber?: bigint;
  chainId?: number;
  latencyMs: number;
  error?: string;
}
