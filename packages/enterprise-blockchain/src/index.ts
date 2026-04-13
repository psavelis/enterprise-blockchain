/**
 * @psavelis/enterprise-blockchain
 *
 * Production-grade enterprise blockchain modules:
 * - MPC (Multiparty Computation) with post-quantum cryptography
 * - HSM (Hardware Security Module) key management
 * - STARK settlement with recursive proof aggregation
 * - Protocol adapters for Fabric, Besu, and Corda
 *
 * @license Apache-2.0
 */

// Core utilities
export * from "./shared/index.js";

// Cryptography
export * from "./mpc/index.js";
export * from "./hsm/index.js";
export * from "./p2mr/index.js";

// Settlement - exclude InMemoryAuditLog to avoid conflict with HSM module
export {
  // Domain Types
  type AssetType,
  type AssetConfig,
  type MirrorAccount,
  type TransactionType,
  type TransactionStatus,
  type LedgerTransaction,
  type TransactionPayload,
  type BaseProof,
  type Tier1Proof,
  type Tier2BlockProof,
  type OutboxEntryStatus,
  type OutboxEntry,
  type NetTransfer,
  type SolanaSettlementResult,
  type BitcoinSettlementResult,
  type FiatSettlementResult,
  type DepositEvent,
  type RaftState,
  type RaftNode,
  type AuditRecord,
  ASSET_CONFIGS,
  // Value Objects
  STARK_PRIME,
  STARK_GENERATOR,
  FieldElement,
  IdempotencyKey,
  ProofCommitment,
  StateRoot,
  Amount,
  sha256,
  sha256Bytes,
  pedersenHash,
  // Port Interfaces
  type StarkProofGeneratorPort,
  type LedgerPersistencePort,
  type OutboxPort,
  type OffsetTrackingPort,
  type SolanaSettlementPort,
  type BitcoinSettlementPort,
  type FiatSettlementPort,
  type OutboxListenerPort,
  type DilithiumSigningPort,
  type TransactionSigningPort,
  type AuditPort,
  type RaftPort,
  type ClockPort,
  type SettlementEvent,
  type EventEmitterPort,
  // Infrastructure Adapters
  InMemoryLedgerStore,
  InMemoryOutboxStore,
  InMemoryOffsetStore,
  MockStarkAdapter,
  FlexibleMockStarkAdapter,
  type MockStarkAdapterConfig,
  SystemClock,
  FixedClock,
  defaultClock,
  InMemoryEventEmitter,
  AsyncEventEmitter,
  defaultEventEmitter,
  DilithiumSigningAdapter,
  TransactionSigningAdapter,
  MockDilithiumAdapter,
  defaultDilithiumAdapter,
  createTransactionSigningAdapter,
  // Rename STARK InMemoryAuditLog to avoid conflict with HSM
  InMemoryAuditLog as StarkInMemoryAuditLog,
  defaultAuditLog as starkDefaultAuditLog,
  StarknetProofAdapter,
  createStarknetProofAdapter,
  type StarknetProofAdapterConfig,
  StoneProofAdapter,
  createStoneProofAdapter,
  type StoneProofAdapterConfig,
  SolanaDevnetAdapter,
  MockSolanaAdapter,
  type SolanaAdapterConfig,
  BitcoinTestnetAdapter,
  MockBitcoinAdapter,
  type BitcoinAdapterConfig,
  FiatMockAdapter,
  MockFiatAdapter,
  type FiatAdapterConfig,
  // Application Services
  LedgerService,
  type CreateAccountOptions,
  type SubmitTransactionOptions,
  type SubmitTransactionResult,
  AggregatorService,
  type AggregationResult,
  type AggregatorConfig,
  SettlementService,
  type SettlementRailResult,
  type SettleAllRailsResult,
  type SettlementServiceConfig,
  // Service Context
  type SettlementContext,
  type CreateContextOptions,
  createDefaultContext,
  type ProductionContextOptions,
  createProductionContext,
  createTestContext,
} from "./stark-settlement/index.js";

// Domain modules
export * from "./credentialing/index.js";
export * from "./privacy/index.js";
export * from "./traceability/index.js";
export * from "./aid-settlement/index.js";

// Protocol adapters (types only - no runtime dependencies)
export * from "./protocols/index.js";

// NOTE: Integrations are NOT re-exported from the package root to preserve
// optional peer dependencies. Import them via their dedicated subpath:
//   import { ... } from "@psavelis/enterprise-blockchain/integrations";
