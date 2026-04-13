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
} from "./domain/entities.js";

export { ASSET_CONFIGS } from "./domain/entities.js";

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
} from "./domain/value-objects.js";

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
} from "./domain/ports.js";

// ─────────────────────────────────────────────────────────────────────────────
// Infrastructure Adapters
// ─────────────────────────────────────────────────────────────────────────────

// Persistence
export { InMemoryLedgerStore } from "./infrastructure/persistence/ledger-store.js";
export { InMemoryOutboxStore } from "./infrastructure/persistence/outbox-store.js";
export { InMemoryOffsetStore } from "./infrastructure/persistence/offset-store.js";

// STARK Proofs
export {
  MockStarkAdapter,
  FlexibleMockStarkAdapter,
} from "./infrastructure/adapters/mock-stark-adapter.js";
export type { MockStarkAdapterConfig } from "./infrastructure/adapters/mock-stark-adapter.js";

// Clock
export {
  SystemClock,
  FixedClock,
  defaultClock,
} from "./infrastructure/adapters/clock-adapter.js";

// Events
export {
  InMemoryEventEmitter,
  AsyncEventEmitter,
  defaultEventEmitter,
} from "./infrastructure/adapters/event-emitter-adapter.js";

// Signing
export {
  DilithiumSigningAdapter,
  TransactionSigningAdapter,
  MockDilithiumAdapter,
  defaultDilithiumAdapter,
  createTransactionSigningAdapter,
} from "./infrastructure/adapters/dilithium-adapter.js";

// Audit
export {
  InMemoryAuditLog,
  defaultAuditLog,
} from "./infrastructure/adapters/audit-adapter.js";

// StarkNet
export {
  StarknetProofAdapter,
  createStarknetProofAdapter,
} from "./infrastructure/adapters/starknet-proof-adapter.js";
export type { StarknetProofAdapterConfig } from "./infrastructure/adapters/starknet-proof-adapter.js";

// Stone Prover (Production)
export {
  StoneProofAdapter,
  createStoneProofAdapter,
} from "./infrastructure/adapters/stone-proof-adapter.js";
export type { StoneProofAdapterConfig } from "./infrastructure/adapters/stone-proof-adapter.js";

// External Chains
export {
  SolanaDevnetAdapter,
  MockSolanaAdapter,
} from "./infrastructure/adapters/solana-adapter.js";
export type { SolanaAdapterConfig } from "./infrastructure/adapters/solana-adapter.js";

export {
  BitcoinTestnetAdapter,
  MockBitcoinAdapter,
} from "./infrastructure/adapters/bitcoin-adapter.js";
export type { BitcoinAdapterConfig } from "./infrastructure/adapters/bitcoin-adapter.js";

export {
  FiatMockAdapter,
  MockFiatAdapter,
} from "./infrastructure/adapters/fiat-adapter.js";
export type { FiatAdapterConfig } from "./infrastructure/adapters/fiat-adapter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Application Services
// ─────────────────────────────────────────────────────────────────────────────

export { LedgerService } from "./application/ledger-service.js";
export type {
  CreateAccountOptions,
  SubmitTransactionOptions,
  SubmitTransactionResult,
} from "./application/ledger-service.js";

export { AggregatorService } from "./application/aggregator-service.js";
export type {
  AggregationResult,
  AggregatorConfig,
} from "./application/aggregator-service.js";

export { SettlementService } from "./application/settlement-service.js";
export type {
  SettlementRailResult,
  SettleAllRailsResult,
  SettlementServiceConfig,
} from "./application/settlement-service.js";

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
} from "./domain/ports.js";

import { InMemoryLedgerStore } from "./infrastructure/persistence/ledger-store.js";
import { InMemoryOutboxStore } from "./infrastructure/persistence/outbox-store.js";
import { InMemoryOffsetStore } from "./infrastructure/persistence/offset-store.js";
import { FlexibleMockStarkAdapter } from "./infrastructure/adapters/mock-stark-adapter.js";
import { StoneProofAdapter } from "./infrastructure/adapters/stone-proof-adapter.js";
import { SystemClock } from "./infrastructure/adapters/clock-adapter.js";
import { InMemoryEventEmitter } from "./infrastructure/adapters/event-emitter-adapter.js";
import {
  DilithiumSigningAdapter,
  TransactionSigningAdapter,
} from "./infrastructure/adapters/dilithium-adapter.js";
import { InMemoryAuditLog } from "./infrastructure/adapters/audit-adapter.js";

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
 * Options specific to production context.
 */
export interface ProductionContextOptions extends Omit<
  CreateContextOptions,
  "tier1BatchSize" | "tier2BatchSize"
> {
  /** Stone prover gRPC endpoint (default: localhost:10000) */
  proverEndpoint?: string;
  /** Path to compiled Cairo artifacts (default: ./cairo/artifacts) */
  cairoArtifactsPath?: string;
  /** Use mock adapter instead of Stone prover (default: false) */
  useMockProver?: boolean;
}

/**
 * Create a context for production with full batch sizes.
 *
 * By default, uses the StoneProofAdapter for real STARK proof generation.
 * Set useMockProver: true to use the mock adapter for testing without Docker.
 *
 * Requires 128 * 64 = 8,192 transactions per block proof.
 */
export function createProductionContext(
  options: ProductionContextOptions = {},
): SettlementContext {
  const clock = options.clock ?? new SystemClock();

  // Use Stone prover by default, mock if explicitly requested
  let starkProver = options.starkProver;
  if (!starkProver) {
    if (options.useMockProver) {
      starkProver = new FlexibleMockStarkAdapter(clock, {
        tier1BatchSize: 128,
        tier2BatchSize: 64,
      });
    } else {
      starkProver = new StoneProofAdapter(clock, {
        proverEndpoint: options.proverEndpoint ?? "localhost:10000",
        cairoArtifactsPath: options.cairoArtifactsPath ?? "./cairo/artifacts",
        tier1BatchSize: 128,
        tier2BatchSize: 64,
      });
    }
  }

  return createDefaultContext({
    ...options,
    clock,
    starkProver,
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
