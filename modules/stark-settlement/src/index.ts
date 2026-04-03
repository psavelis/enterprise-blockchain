/**
 * @enterprise-blockchain/stark-settlement
 *
 * Aggregated STARK Settlement Layer with Recursive Proof Composition
 *
 * A production-grade, quantum-resistant settlement system that:
 * - Uses zk-STARK proofs for verifiable state transitions
 * - Aggregates thousands of transactions into single block proofs
 * - Settles to multiple external chains (Solana, Bitcoin, Fiat)
 * - Provides post-quantum security via ML-DSA-65 signatures
 *
 * Architecture:
 * - Hexagonal (ports & adapters) with no SDK imports in domain layer
 * - 3-tier recursive proof aggregation (Base → Tier-1 → Tier-2)
 * - Exactly-once settlement semantics via idempotency keys
 * - Full observability with OpenTelemetry
 *
 * @example
 * ```typescript
 * import {
 *   LedgerService,
 *   AggregatorService,
 *   SettlementService,
 *   createDefaultContext,
 * } from "@enterprise-blockchain/stark-settlement";
 *
 * // Create services with default adapters
 * const ctx = createDefaultContext();
 * const ledger = new LedgerService(ctx);
 * const aggregator = new AggregatorService(ctx);
 * const settler = new SettlementService(ctx);
 *
 * // Submit a transaction
 * const tx = await ledger.submitTransaction({
 *   type: "transfer",
 *   fromAccountId: "alice",
 *   toAccountId: "bob",
 *   assetType: "SOL",
 *   amount: 1000000000n, // 1 SOL in lamports
 * });
 *
 * // Generate proofs and settle
 * const blockProof = await aggregator.processToBlockProof();
 * const result = await settler.settleAllRails(blockProof);
 * ```
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain Types
// ─────────────────────────────────────────────────────────────────────────────

export type {
  AssetType,
  AssetConfig,
  MirrorAccount,
  TransactionType,
  TransactionStatus,
  LedgerTransaction,
  TransactionPayload,
  BaseProof,
  Tier1Proof,
  Tier2BlockProof,
  OutboxEntryStatus,
  OutboxEntry,
  NetTransfer,
  SolanaSettlementResult,
  BitcoinSettlementResult,
  FiatSettlementResult,
  DepositEvent,
  RaftState,
  RaftNode,
  AuditRecord,
} from "./domain/entities";

export { ASSET_CONFIGS } from "./domain/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Value Objects
// ─────────────────────────────────────────────────────────────────────────────

export {
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
} from "./domain/value-objects";

// ─────────────────────────────────────────────────────────────────────────────
// Port Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type {
  StarkProofGeneratorPort,
  LedgerPersistencePort,
  OutboxPort,
  OffsetTrackingPort,
  SolanaSettlementPort,
  BitcoinSettlementPort,
  FiatSettlementPort,
  OutboxListenerPort,
  DilithiumSigningPort,
  TransactionSigningPort,
  AuditPort,
  RaftPort,
  ClockPort,
  SettlementEvent,
  EventEmitterPort,
} from "./domain/ports";

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure Adapters
// ─────────────────────────────────────────────────────────────────────────────

// Persistence
export { InMemoryLedgerStore } from "./infrastructure/persistence/ledger-store";
export { InMemoryOutboxStore } from "./infrastructure/persistence/outbox-store";
export { InMemoryOffsetStore } from "./infrastructure/persistence/offset-store";

// STARK Proofs
export {
  MockStarkAdapter,
  FlexibleMockStarkAdapter,
} from "./infrastructure/adapters/mock-stark-adapter";
export type { MockStarkAdapterConfig } from "./infrastructure/adapters/mock-stark-adapter";

// Clock
export {
  SystemClock,
  FixedClock,
  defaultClock,
} from "./infrastructure/adapters/clock-adapter";

// Events
export {
  InMemoryEventEmitter,
  AsyncEventEmitter,
  defaultEventEmitter,
} from "./infrastructure/adapters/event-emitter-adapter";

// Signing
export {
  DilithiumSigningAdapter,
  TransactionSigningAdapter,
  MockDilithiumAdapter,
  defaultDilithiumAdapter,
  createTransactionSigningAdapter,
} from "./infrastructure/adapters/dilithium-adapter";

// Audit
export {
  InMemoryAuditLog,
  defaultAuditLog,
} from "./infrastructure/adapters/audit-adapter";

// StarkNet
export {
  StarknetProofAdapter,
  createStarknetProofAdapter,
} from "./infrastructure/adapters/starknet-proof-adapter";
export type { StarknetProofAdapterConfig } from "./infrastructure/adapters/starknet-proof-adapter";

// External Chains
export {
  SolanaDevnetAdapter,
  MockSolanaAdapter,
} from "./infrastructure/adapters/solana-adapter";
export type { SolanaAdapterConfig } from "./infrastructure/adapters/solana-adapter";

export {
  BitcoinTestnetAdapter,
  MockBitcoinAdapter,
} from "./infrastructure/adapters/bitcoin-adapter";
export type { BitcoinAdapterConfig } from "./infrastructure/adapters/bitcoin-adapter";

export {
  FiatMockAdapter,
  MockFiatAdapter,
} from "./infrastructure/adapters/fiat-adapter";
export type { FiatAdapterConfig } from "./infrastructure/adapters/fiat-adapter";

// ─────────────────────────────────────────────────────────────────────────────
// Application Services
// ─────────────────────────────────────────────────────────────────────────────

export { LedgerService } from "./application/ledger-service";
export type {
  CreateAccountOptions,
  SubmitTransactionOptions,
  SubmitTransactionResult,
} from "./application/ledger-service";

export { AggregatorService } from "./application/aggregator-service";
export type {
  AggregationResult,
  AggregatorConfig,
} from "./application/aggregator-service";

export { SettlementService } from "./application/settlement-service";
export type {
  SettlementRailResult,
  SettleAllRailsResult,
  SettlementServiceConfig,
} from "./application/settlement-service";

// ─────────────────────────────────────────────────────────────────────────────
// Service Context
// ─────────────────────────────────────────────────────────────────────────────

import type {
  StarkProofGeneratorPort,
  LedgerPersistencePort,
  OutboxPort,
  OffsetTrackingPort,
  DilithiumSigningPort,
  TransactionSigningPort,
  AuditPort,
  ClockPort,
  EventEmitterPort,
} from "./domain/ports";

import { InMemoryLedgerStore } from "./infrastructure/persistence/ledger-store";
import { InMemoryOutboxStore } from "./infrastructure/persistence/outbox-store";
import { InMemoryOffsetStore } from "./infrastructure/persistence/offset-store";
import { FlexibleMockStarkAdapter } from "./infrastructure/adapters/mock-stark-adapter";
import { SystemClock } from "./infrastructure/adapters/clock-adapter";
import { InMemoryEventEmitter } from "./infrastructure/adapters/event-emitter-adapter";
import {
  DilithiumSigningAdapter,
  TransactionSigningAdapter,
} from "./infrastructure/adapters/dilithium-adapter";
import { InMemoryAuditLog } from "./infrastructure/adapters/audit-adapter";

/**
 * Context containing all dependencies for the settlement layer.
 *
 * Follows dependency injection pattern for testability.
 */
export interface SettlementContext {
  readonly clock: ClockPort;
  readonly ledgerStore: LedgerPersistencePort;
  readonly outboxStore: OutboxPort;
  readonly offsetStore: OffsetTrackingPort;
  readonly starkProver: StarkProofGeneratorPort;
  readonly dilithium: DilithiumSigningPort;
  readonly transactionSigning: TransactionSigningPort;
  readonly auditLog: AuditPort;
  readonly events: EventEmitterPort;
}

/**
 * Options for creating a settlement context.
 */
export interface CreateContextOptions {
  /** Clock implementation (default: SystemClock) */
  clock?: ClockPort;
  /** Ledger store implementation (default: InMemoryLedgerStore) */
  ledgerStore?: LedgerPersistencePort;
  /** Outbox store implementation (default: InMemoryOutboxStore) */
  outboxStore?: OutboxPort;
  /** Offset store implementation (default: InMemoryOffsetStore) */
  offsetStore?: OffsetTrackingPort;
  /** STARK prover implementation (default: FlexibleMockStarkAdapter) */
  starkProver?: StarkProofGeneratorPort;
  /** Dilithium signing implementation (default: DilithiumSigningAdapter) */
  dilithium?: DilithiumSigningPort;
  /** Transaction signing implementation (default: TransactionSigningAdapter) */
  transactionSigning?: TransactionSigningPort;
  /** Audit log implementation (default: InMemoryAuditLog) */
  auditLog?: AuditPort;
  /** Event emitter implementation (default: InMemoryEventEmitter) */
  events?: EventEmitterPort;
  /** Tier-1 batch size for mock STARK adapter (default: 8) */
  tier1BatchSize?: number;
  /** Tier-2 batch size for mock STARK adapter (default: 4) */
  tier2BatchSize?: number;
}

/**
 * Create a settlement context with default or custom adapters.
 *
 * @example
 * ```typescript
 * // Default context (all in-memory, mock STARK)
 * const ctx = createDefaultContext();
 *
 * // Custom batch sizes for demos
 * const demoCtx = createDefaultContext({
 *   tier1BatchSize: 4,
 *   tier2BatchSize: 2,
 * });
 *
 * // Custom adapters (clock must be passed to StarknetProofAdapter)
 * const clock = new SystemClock();
 * const prodCtx = createDefaultContext({
 *   clock,
 *   starkProver: new StarknetProofAdapter(clock),
 *   ledgerStore: new PostgresLedgerStore(connectionString),
 * });
 * ```
 */
export function createDefaultContext(
  options: CreateContextOptions = {},
): SettlementContext {
  const clock = options.clock ?? new SystemClock();
  const ledgerStore = options.ledgerStore ?? new InMemoryLedgerStore();
  const outboxStore = options.outboxStore ?? new InMemoryOutboxStore();
  const offsetStore = options.offsetStore ?? new InMemoryOffsetStore();
  const dilithium = options.dilithium ?? new DilithiumSigningAdapter();
  const transactionSigning =
    options.transactionSigning ?? new TransactionSigningAdapter(dilithium);
  const auditLog = options.auditLog ?? new InMemoryAuditLog();
  const events = options.events ?? new InMemoryEventEmitter();

  // Default to small batch sizes for demos (full: 128/64)
  const tier1BatchSize = options.tier1BatchSize ?? 8;
  const tier2BatchSize = options.tier2BatchSize ?? 4;

  const starkProver =
    options.starkProver ??
    new FlexibleMockStarkAdapter(clock, {
      tier1BatchSize,
      tier2BatchSize,
    });

  return {
    clock,
    ledgerStore,
    outboxStore,
    offsetStore,
    starkProver,
    dilithium,
    transactionSigning,
    auditLog,
    events,
  };
}

/**
 * Create a context for production with full batch sizes.
 *
 * Requires 128 * 64 = 8,192 transactions per block proof.
 */
export function createProductionContext(
  options: Omit<CreateContextOptions, "tier1BatchSize" | "tier2BatchSize"> = {},
): SettlementContext {
  return createDefaultContext({
    ...options,
    tier1BatchSize: 128,
    tier2BatchSize: 64,
  });
}

/**
 * Create a context for testing with minimal batch sizes.
 *
 * Requires only 2 * 2 = 4 transactions per block proof.
 */
export function createTestContext(
  options: Omit<CreateContextOptions, "tier1BatchSize" | "tier2BatchSize"> = {},
): SettlementContext {
  return createDefaultContext({
    ...options,
    tier1BatchSize: 2,
    tier2BatchSize: 2,
  });
}
