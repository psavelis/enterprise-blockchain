/**
 * Protocol adapter interfaces for enterprise blockchain platforms.
 *
 * These ports define the contract between domain logic and
 * platform-specific implementations (Fabric, Besu, Corda).
 */

// Traceability port
export type { TraceabilityProtocolAdapter } from "./traceability-port.js";

// Privacy port
export type { PrivacyProtocolAdapter } from "./privacy-port.js";

// Credentialing port
export type { CredentialingProtocolAdapter } from "./credentialing-port.js";

// Fabric protocol ports
export type {
  FabricInvocationResult,
  FabricEndorsementPolicy,
  IFabricSubmitPort,
  IFabricQueryPort,
  IFabricPrivateDataPort,
  IFabricEventPort,
  FabricChaincodeEvent,
} from "./fabric-port.js";

// Besu protocol ports
export type {
  BesuTransactionResult,
  BesuGasEstimate,
  IBesuTransactionPort,
  IBesuQueryPort,
  IBesuPrivacyPort,
} from "./besu-port.js";

// Corda protocol ports
export type {
  CordaFlowResult,
  CordaTransactionInfo,
  ICordaFlowPort,
  ICordaVaultPort,
  CordaQueryCriteria,
  CordaVaultState,
  ICordaIdentityPort,
  CordaPartyInfo,
} from "./corda-port.js";

// P2MR protocol ports
export type {
  P2MRCreateResult,
  P2MRSpendResult,
  P2MROutputStatus,
  IP2MRCreatePort,
  IP2MRSpendPort,
  IP2MRQueryPort,
  IP2MRProtocolAdapter,
  P2MRProtocolConfig,
} from "./p2mr-port.js";
