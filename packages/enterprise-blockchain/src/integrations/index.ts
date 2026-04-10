/**
 * Integration clients for enterprise blockchain platforms.
 *
 * Provides SDK-based clients for:
 * - Hyperledger Fabric (via @hyperledger/fabric-gateway)
 * - Hyperledger Besu (via ethers.js)
 * - R3 Corda (via REST gateway)
 *
 * Each client includes circuit breaker and retry patterns for resilience.
 */

// Fabric Gateway
export {
  FabricProfileFactory,
  FabricConnectionFactory,
  FabricGatewayFactory,
  FabricProposalBuilder,
  FabricGatewayClientSketch,
  type FabricGatewayProfile,
  type FabricProposalPlan,
} from "./fabric-gateway/index.js";
export type {
  IFabricProfileFactory,
  IFabricConnectionFactory,
  IFabricGatewayFactory,
  IFabricProposalBuilder,
} from "./fabric-gateway/ports.js";

// Besu Client
export {
  BesuProfileFactory,
  BesuProviderFactory,
  BesuGasEstimator,
  BesuTransactionBuilder,
  BesuTransactionSender,
  BesuHealthChecker,
  BesuEthersClientSketch,
  type BesuRpcProfile,
  type BesuPrivateTransactionRequest,
  type BesuHealthStatus,
} from "./besu-client/index.js";
export type {
  IBesuProfileFactory,
  IBesuProviderFactory,
  IBesuGasEstimator,
  IBesuTransactionBuilder,
  IBesuTransactionSender,
  IBesuHealthChecker,
} from "./besu-client/ports.js";

// Corda Gateway
export {
  CordaProfileFactory,
  CordaRequestBuilder,
  CordaFlowInvoker,
  CordaGatewayClientSketch,
  type CordaGatewayProfile,
  type CordaGatewayRequest,
  type ProviderClearancePayload,
} from "./corda-gateway/index.js";
export type {
  ICordaProfileFactory,
  ICordaRequestBuilder,
  ICordaFlowInvoker,
} from "./corda-gateway/ports.js";

// Shared utilities
export {
  CircuitBreaker,
  withRetry,
  FABRIC_RETRY_POLICY,
  BESU_RETRY_POLICY,
  BESU_NON_RETRYABLE,
  CORDA_RETRY_POLICY,
  CORDA_NON_RETRYABLE,
  type CircuitBreakerOptions,
  type RetryPolicy,
} from "./shared/retry.js";
export { getRequiredEnv, getOptionalEnv, getNumberEnv } from "./shared/env.js";
