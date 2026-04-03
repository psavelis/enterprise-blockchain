/**
 * Port Interfaces for Aggregated STARK Settlement Layer (Hexagonal Architecture)
 *
 * Ports define the boundaries of the domain:
 * - Input ports: How the application receives requests
 * - Output ports: How the application interacts with external systems
 *
 * All ports are pure interfaces with no implementation details.
 * Adapters in the infrastructure layer implement these ports.
 *
 * @see modules/p2mr/src/ports.ts for similar hexagonal pattern
 * @see docs/adr/ADR-0001-hexagonal-architecture.md
 */

import type {
  AssetType,
  MirrorAccount,
  LedgerTransaction,
  TransactionPayload,
  BaseProof,
  Tier1Proof,
  Tier2BlockProof,
  OutboxEntry,
  NetTransfer,
  SolanaSettlementResult,
  BitcoinSettlementResult,
  FiatSettlementResult,
  DepositEvent,
  AuditRecord,
  RaftNode,
} from "./entities";

// ─────────────────────────────────────────────────────────────────────────────
// STARK Proof Generation Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for STARK proof generation and verification.
 *
 * Implementations:
 * - StarknetProofAdapter: Real proof generation via starknet.js
 * - MockProofAdapter: Simulated proofs for testing
 */
export interface StarkProofGeneratorPort {
  /**
   * Generate a base proof for a single transaction.
   *
   * @param tx - The ledger transaction to prove
   * @param preStateRoot - State root before the transaction
   * @param postStateRoot - State root after the transaction
   * @returns Base proof with STARK data and public inputs
   */
  generateBaseProof(
    tx: LedgerTransaction,
    preStateRoot: string,
    postStateRoot: string,
  ): Promise<BaseProof>;

  /**
   * Aggregate 128 base proofs into a Tier-1 proof using recursive verification.
   *
   * @param baseProofs - Exactly 128 base proofs to aggregate
   * @returns Aggregated Tier-1 proof
   * @throws If baseProofs.length !== 128
   */
  aggregateTier1(baseProofs: readonly BaseProof[]): Promise<Tier1Proof>;

  /**
   * Aggregate 64 Tier-1 proofs into a final Tier-2 block proof.
   *
   * @param tier1Proofs - Exactly 64 Tier-1 proofs to aggregate
   * @returns Final block proof ready for settlement
   * @throws If tier1Proofs.length !== 64
   */
  aggregateTier2(tier1Proofs: readonly Tier1Proof[]): Promise<Tier2BlockProof>;

  /**
   * Verify a Tier-2 block proof off-chain.
   *
   * @param blockProof - The block proof to verify
   * @returns true if proof is valid
   */
  verifyBlockProof(blockProof: Tier2BlockProof): Promise<boolean>;

  /**
   * Get the verification key hash for the current proof system.
   */
  getVerificationKeyHash(): Promise<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Persistence Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for ledger state persistence.
 *
 * Implementations:
 * - InMemoryLedgerStore: For testing and demos
 * - PostgresLedgerStore: For production (future)
 */
export interface LedgerPersistencePort {
  // ─── Accounts ───────────────────────────────────────────────────────────

  /**
   * Create a new mirror account.
   */
  createAccount(account: MirrorAccount): Promise<void>;

  /**
   * Get an account by ID.
   */
  getAccount(accountId: string): Promise<MirrorAccount | null>;

  /**
   * Get an account by external address and asset type.
   */
  getAccountByAddress(
    externalAddress: string,
    assetType: AssetType,
  ): Promise<MirrorAccount | null>;

  /**
   * Update an account's balance.
   *
   * @param accountId - Account to update
   * @param delta - Amount to add (positive) or subtract (negative)
   * @param newProofRoot - Updated proof root
   */
  updateAccountBalance(
    accountId: string,
    delta: bigint,
    newProofRoot: string,
  ): Promise<void>;

  /**
   * Get all accounts for an asset type.
   */
  getAccountsByAssetType(
    assetType: AssetType,
  ): Promise<readonly MirrorAccount[]>;

  // ─── Transactions ───────────────────────────────────────────────────────

  /**
   * Append a transaction to the ledger (append-only).
   */
  appendTransaction(tx: LedgerTransaction): Promise<void>;

  /**
   * Get a transaction by ID.
   */
  getTransaction(txId: string): Promise<LedgerTransaction | null>;

  /**
   * Get transactions by idempotency key (for duplicate detection).
   */
  getTransactionsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<readonly LedgerTransaction[]>;

  /**
   * Get pending transactions (not yet proved).
   */
  getPendingTransactions(limit: number): Promise<readonly LedgerTransaction[]>;

  /**
   * Update transaction status.
   */
  updateTransactionStatus(
    txId: string,
    status: LedgerTransaction["status"],
  ): Promise<void>;

  // ─── Proofs ─────────────────────────────────────────────────────────────

  /**
   * Save a base proof.
   */
  saveBaseProof(proof: BaseProof): Promise<void>;

  /**
   * Get a base proof by ID.
   */
  getBaseProof(proofId: string): Promise<BaseProof | null>;

  /**
   * Get base proofs that haven't been aggregated into Tier-1.
   */
  getUnaggregatedBaseProofs(limit: number): Promise<readonly BaseProof[]>;

  /**
   * Save a Tier-1 proof.
   */
  saveTier1Proof(proof: Tier1Proof): Promise<void>;

  /**
   * Get a Tier-1 proof by ID.
   */
  getTier1Proof(proofId: string): Promise<Tier1Proof | null>;

  /**
   * Get Tier-1 proofs that haven't been aggregated into Tier-2.
   */
  getUnaggregatedTier1Proofs(limit: number): Promise<readonly Tier1Proof[]>;

  /**
   * Save a Tier-2 block proof.
   */
  saveTier2Proof(proof: Tier2BlockProof): Promise<void>;

  /**
   * Get a Tier-2 proof by ID.
   */
  getTier2Proof(blockProofId: string): Promise<Tier2BlockProof | null>;

  /**
   * Get the latest block proof.
   */
  getLatestBlockProof(): Promise<Tier2BlockProof | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbox Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for the settlement outbox queue.
 *
 * Implements append-only queue with exactly-once consumption semantics.
 */
export interface OutboxPort {
  /**
   * Append an entry to the outbox.
   */
  appendEntry(entry: OutboxEntry): Promise<void>;

  /**
   * Get pending entries for an asset type.
   */
  getPendingEntries(
    assetType: AssetType,
    limit: number,
  ): Promise<readonly OutboxEntry[]>;

  /**
   * Get an entry by ID.
   */
  getEntry(entryId: string): Promise<OutboxEntry | null>;

  /**
   * Mark an entry as processing (in-flight).
   */
  markProcessing(entryId: string): Promise<void>;

  /**
   * Mark an entry as settled.
   */
  markSettled(entryId: string, settlementTxId: string): Promise<void>;

  /**
   * Mark an entry as failed.
   */
  markFailed(entryId: string, errorMessage: string): Promise<void>;

  /**
   * Get entries that need retry (failed but under max retries).
   */
  getRetryableEntries(
    assetType: AssetType,
    limit: number,
  ): Promise<readonly OutboxEntry[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Offset Tracking Port (Exactly-Once)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for tracking consumer offsets in the outbox.
 *
 * Enables exactly-once processing by tracking the last processed offset.
 */
export interface OffsetTrackingPort {
  /**
   * Get the current offset for a consumer.
   */
  getOffset(consumerId: string, assetType: AssetType): Promise<bigint>;

  /**
   * Commit a new offset (atomically).
   */
  commitOffset(
    consumerId: string,
    assetType: AssetType,
    offset: bigint,
  ): Promise<void>;

  /**
   * Get all consumer offsets for an asset type.
   */
  getConsumerOffsets(
    assetType: AssetType,
  ): Promise<ReadonlyMap<string, bigint>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// External Chain Settlement Ports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for Solana settlement operations.
 */
export interface SolanaSettlementPort {
  /**
   * Execute a batched transfer using VersionedTransaction with lookup tables.
   *
   * @param transfers - Net transfers to execute
   * @param blockProof - Block proof for commitment
   * @returns Settlement result with signature
   */
  executeBatchedTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<SolanaSettlementResult>;

  /**
   * Subscribe to deposit events on specified addresses.
   */
  subscribeDeposits(
    addresses: readonly string[],
    callback: (deposit: DepositEvent) => void,
  ): Promise<{ unsubscribe: () => void }>;

  /**
   * Get the current slot for health checks.
   */
  getHealth(): Promise<{ healthy: boolean; slot: number }>;

  /**
   * Get or create an address lookup table for batch optimization.
   */
  getOrCreateLookupTable(addresses: readonly string[]): Promise<string>;
}

/**
 * Port for Bitcoin settlement operations.
 */
export interface BitcoinSettlementPort {
  /**
   * Execute a batched UTXO spend using PSBT.
   *
   * @param transfers - Net transfers to execute
   * @param blockProof - Block proof for OP_RETURN commitment
   * @returns Settlement result with txid
   */
  executeBatchedSpend(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<BitcoinSettlementResult>;

  /**
   * Watch addresses for incoming deposits.
   */
  watchAddresses(
    addresses: readonly string[],
    callback: (deposit: DepositEvent) => void,
  ): Promise<{ unwatch: () => void }>;

  /**
   * Get the current block height for health checks.
   */
  getHealth(): Promise<{ healthy: boolean; blockHeight: number }>;

  /**
   * Get UTXOs for an address.
   */
  getUtxos(
    address: string,
  ): Promise<
    readonly { txid: string; vout: number; value: bigint; confirmed: boolean }[]
  >;
}

/**
 * Port for fiat settlement operations (mock ISO 20022).
 */
export interface FiatSettlementPort {
  /**
   * Execute a credit transfer via ISO 20022 pain.001.
   *
   * @param transfers - Net transfers to execute
   * @param blockProof - Block proof for remittance info
   * @returns Settlement result with message ID
   */
  executeTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<FiatSettlementResult>;

  /**
   * Get the health status of the fiat rail.
   */
  getHealth(): Promise<{ healthy: boolean }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// gRPC Streaming Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for bidirectional gRPC streaming of outbox entries.
 */
export interface OutboxListenerPort {
  /**
   * Start streaming outbox entries for an asset type.
   *
   * @param assetType - Asset type to stream
   * @param onEntry - Callback for each entry
   * @param onError - Error callback
   * @returns Control object to stop streaming
   */
  startStreaming(
    assetType: AssetType,
    onEntry: (entry: OutboxEntry) => Promise<void>,
    onError: (error: Error) => void,
  ): Promise<{ stop: () => void }>;

  /**
   * Acknowledge processing of an entry (commits offset).
   */
  acknowledge(entryId: string, offset: bigint): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// ML-DSA Signing Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for ML-DSA-65 (Dilithium) signing operations.
 *
 * Reuses the existing MPC module's ML-DSA implementation.
 */
export interface DilithiumSigningPort {
  /**
   * Generate an ML-DSA-65 keypair.
   */
  generateKeyPair(): {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };

  /**
   * Sign a message with ML-DSA-65.
   */
  sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;

  /**
   * Verify an ML-DSA-65 signature.
   */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;

  /**
   * Get the SHA-256 hash of a public key.
   */
  hashPublicKey(publicKey: Uint8Array): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Signing Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for signing transaction payloads.
 *
 * Combines serialization and ML-DSA signing.
 */
export interface TransactionSigningPort {
  /**
   * Sign a transaction payload.
   *
   * @param payload - Transaction payload to sign
   * @param secretKey - ML-DSA-65 secret key
   * @returns Signature bytes
   */
  signPayload(payload: TransactionPayload, secretKey: Uint8Array): Uint8Array;

  /**
   * Verify a transaction signature.
   *
   * @param payload - Original payload
   * @param signature - Signature to verify
   * @param publicKey - Signer's public key
   * @returns true if valid
   */
  verifyPayload(
    payload: TransactionPayload,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;

  /**
   * Serialize a payload to canonical bytes for signing.
   */
  serializePayload(payload: TransactionPayload): Uint8Array;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for audit logging (compliance).
 */
export interface AuditPort {
  /**
   * Append an audit record.
   */
  append(
    record: Omit<AuditRecord, "recordId" | "previousHash" | "recordHash">,
  ): Promise<AuditRecord>;

  /**
   * Get audit records for an entity.
   */
  getRecordsForEntity(entityId: string): Promise<readonly AuditRecord[]>;

  /**
   * Verify the integrity of the audit chain.
   */
  verifyChainIntegrity(): Promise<{
    valid: boolean;
    lastValidRecord: string | null;
    errorMessage: string | null;
  }>;

  /**
   * Get the latest audit record.
   */
  getLatestRecord(): Promise<AuditRecord | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Raft Consensus Port (HA Simulation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for Raft consensus operations (HA cluster).
 */
export interface RaftPort {
  /**
   * Get the current node state.
   */
  getNodeState(): Promise<RaftNode>;

  /**
   * Check if this node is the leader.
   */
  isLeader(): Promise<boolean>;

  /**
   * Get the current leader ID (null if no leader).
   */
  getLeaderId(): Promise<string | null>;

  /**
   * Propose a value to the cluster (must be leader).
   */
  propose<T>(value: T): Promise<{ accepted: boolean; term: bigint }>;

  /**
   * Wait for leadership (blocks until this node becomes leader).
   */
  waitForLeadership(timeoutMs: number): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Clock Port (for testability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Port for time operations (enables deterministic testing).
 */
export interface ClockPort {
  /**
   * Get the current timestamp in milliseconds.
   */
  now(): number;

  /**
   * Generate a UUID v4.
   */
  uuid(): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Emitter Port
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Domain events emitted by the settlement layer.
 */
export type SettlementEvent =
  | { type: "transaction:submitted"; tx: LedgerTransaction }
  | { type: "proof:base:generated"; proof: BaseProof }
  | { type: "proof:tier1:generated"; proof: Tier1Proof }
  | { type: "proof:tier2:generated"; proof: Tier2BlockProof }
  | { type: "settlement:initiated"; entry: OutboxEntry }
  | {
      type: "settlement:completed";
      entry: OutboxEntry;
      result:
        | SolanaSettlementResult
        | BitcoinSettlementResult
        | FiatSettlementResult;
    }
  | { type: "settlement:failed"; entry: OutboxEntry; error: string }
  | { type: "deposit:detected"; event: DepositEvent }
  | { type: "deposit:mirrored"; event: DepositEvent; tx: LedgerTransaction };

/**
 * Port for domain event emission (observable pattern).
 */
export interface EventEmitterPort {
  /**
   * Emit a domain event.
   */
  emit(event: SettlementEvent): void;

  /**
   * Subscribe to domain events.
   */
  subscribe(handler: (event: SettlementEvent) => void): {
    unsubscribe: () => void;
  };

  /**
   * Subscribe to a specific event type.
   */
  on<T extends SettlementEvent["type"]>(
    eventType: T,
    handler: (event: Extract<SettlementEvent, { type: T }>) => void,
  ): { unsubscribe: () => void };
}
