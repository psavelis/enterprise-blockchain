/**
 * Domain Entities for Aggregated STARK Settlement Layer
 *
 * Core types representing the business domain:
 * - Mirror accounts (custodial balances per asset/chain)
 * - Ledger transactions (signed state transitions)
 * - STARK proofs (3-tier recursive aggregation)
 * - Outbox entries (pending settlements)
 * - Settlement results (per-chain outcomes)
 *
 * All entities are immutable (readonly properties) following DDD patterns.
 * No external SDK imports - pure domain types.
 *
 * @see skills/post-quantum-crypto.md for ML-DSA-65 signature context
 * @see docs/adr/ADR-0001-hexagonal-architecture.md for design rationale
 */

// ─────────────────────────────────────────────────────────────────────────────
// Asset Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported asset types for cross-chain settlement.
 * Each asset type maps to a specific external chain or rail.
 */
export type AssetType = "SOL" | "BTC" | "USD";

/**
 * Asset configuration including decimal precision and chain-specific metadata.
 */
export interface AssetConfig {
  readonly type: AssetType;
  /** Decimal places for human-readable conversion (SOL=9, BTC=8, USD=2) */
  readonly decimals: number;
  /** Human-readable name */
  readonly name: string;
  /** Chain identifier for external settlement */
  readonly chainId: string;
}

/**
 * Standard asset configurations.
 */
export const ASSET_CONFIGS: Record<AssetType, AssetConfig> = {
  SOL: { type: "SOL", decimals: 9, name: "Solana", chainId: "solana-devnet" },
  BTC: {
    type: "BTC",
    decimals: 8,
    name: "Bitcoin",
    chainId: "bitcoin-testnet",
  },
  USD: { type: "USD", decimals: 2, name: "US Dollar", chainId: "fiat-mock" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Mirror Accounts (Custodial)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Custodial mirror account representing an external address's balance
 * within the ZKP ledger.
 *
 * Mirror accounts track:
 * - Current balance (in atomic units)
 * - Link to external chain address
 * - Last STARK proof covering this account
 */
export interface MirrorAccount {
  /** Unique account identifier (UUID v4) */
  readonly id: string;
  /** External chain address (Solana pubkey, BTC address, or fiat account) */
  readonly externalAddress: string;
  /** Asset type this account holds */
  readonly assetType: AssetType;
  /** Current balance in atomic units (lamports, satoshis, cents) */
  readonly balance: bigint;
  /** State root of the last STARK proof that included this account */
  readonly lastProofRoot: string;
  /** Account creation timestamp (Unix ms) */
  readonly createdAt: number;
  /** Last update timestamp (Unix ms) */
  readonly updatedAt: number;
  /** Whether this account is active (false = frozen) */
  readonly isActive: boolean;
  /** Optional metadata for compliance/audit */
  readonly metadata: Readonly<Record<string, string>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Transactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transaction types in the ZKP ledger.
 */
export type TransactionType = "deposit" | "transfer" | "withdrawal";

/**
 * Transaction status in the ledger lifecycle.
 */
export type TransactionStatus =
  | "pending" // Awaiting proof generation
  | "proved" // Base proof generated
  | "aggregated" // Included in Tier-1 proof
  | "finalized" // Included in Tier-2 block proof
  | "settled" // Settlement confirmed on external chain
  | "failed"; // Failed (will not be retried)

/**
 * A signed state transition in the ZKP ledger.
 *
 * Each transaction:
 * - Is signed with ML-DSA-65 (post-quantum)
 * - Has a unique idempotency key
 * - Generates a base STARK proof upon acceptance
 */
export interface LedgerTransaction {
  /** Unique transaction identifier (UUID v4) */
  readonly txId: string;
  /** Transaction type */
  readonly type: TransactionType;
  /** Source account ID (null for deposits) */
  readonly fromAccountId: string | null;
  /** Destination account ID (null for withdrawals) */
  readonly toAccountId: string | null;
  /** Asset type being transferred */
  readonly assetType: AssetType;
  /** Amount in atomic units */
  readonly amount: bigint;
  /** Unique idempotency key for exactly-once processing */
  readonly idempotencyKey: string;
  /** ML-DSA-65 signature over the transaction payload */
  readonly mlDsaSignature: Uint8Array;
  /** SHA-256 hash of the signer's ML-DSA-65 public key */
  readonly mlDsaPublicKeyHash: string;
  /** Current transaction status */
  readonly status: TransactionStatus;
  /** Optional metadata (beneficiary info, reference, etc.) */
  readonly metadata: Readonly<Record<string, string>>;
  /** Transaction creation timestamp (Unix ms) */
  readonly createdAt: number;
  /** Last status update timestamp (Unix ms) */
  readonly updatedAt: number;
}

/**
 * Payload structure that is signed by ML-DSA-65.
 * This is the canonical form for signature verification.
 */
export interface TransactionPayload {
  readonly txId: string;
  readonly type: TransactionType;
  readonly fromAccountId: string | null;
  readonly toAccountId: string | null;
  readonly assetType: AssetType;
  readonly amount: string; // bigint as string for JSON serialization
  readonly idempotencyKey: string;
  readonly createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// STARK Proofs (3-Tier Recursive Aggregation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base proof for a single transaction.
 *
 * Generated by the STARK proof generator for each ledger transaction.
 * Contains the proof that a valid state transition occurred.
 */
export interface BaseProof {
  /** Unique proof identifier (UUID v4) */
  readonly proofId: string;
  /** Transaction ID this proof covers */
  readonly txId: string;
  /** Raw STARK proof bytes */
  readonly starkProof: Uint8Array;
  /** Public inputs as field element hex strings */
  readonly publicInputs: readonly string[];
  /** Hash of the verification key used */
  readonly verificationKeyHash: string;
  /** Pre-state commitment (Merkle root before transition) */
  readonly preStateRoot: string;
  /** Post-state commitment (Merkle root after transition) */
  readonly postStateRoot: string;
  /** Proof generation timestamp (Unix ms) */
  readonly createdAt: number;
}

/**
 * Tier-1 aggregated proof combining 128 base proofs.
 *
 * Uses recursive STARK verification to prove that all 128 base proofs
 * are valid within a single succinct proof.
 */
export interface Tier1Proof {
  /** Unique proof identifier (UUID v4) */
  readonly proofId: string;
  /** IDs of the 128 base proofs aggregated */
  readonly baseProofIds: readonly string[];
  /** Aggregated STARK proof bytes */
  readonly aggregatedProof: Uint8Array;
  /** Public inputs for the aggregated proof */
  readonly publicInputs: readonly string[];
  /** Idempotency keys propagated from all base transactions */
  readonly idempotencyKeys: readonly string[];
  /** Combined pre-state root (first transaction's pre-state) */
  readonly preStateRoot: string;
  /** Combined post-state root (last transaction's post-state) */
  readonly postStateRoot: string;
  /** Number of transactions covered (128) */
  readonly txCount: number;
  /** Proof generation timestamp (Unix ms) */
  readonly createdAt: number;
}

/**
 * Tier-2 block proof combining 64 Tier-1 proofs.
 *
 * Final proof representing up to 8,192 transactions (128 * 64).
 * This is what gets settled to external chains.
 */
export interface Tier2BlockProof {
  /** Unique block proof identifier (UUID v4) */
  readonly blockProofId: string;
  /** IDs of the 64 Tier-1 proofs aggregated */
  readonly tier1ProofIds: readonly string[];
  /** Final STARK proof bytes */
  readonly finalProof: Uint8Array;
  /** Public inputs for the block proof */
  readonly publicInputs: readonly string[];
  /** Final state root after all transactions */
  readonly stateRoot: string;
  /** All idempotency keys (for exactly-once settlement) */
  readonly idempotencyKeys: readonly string[];
  /** Total transaction count (up to 8192) */
  readonly txCount: number;
  /** Block sequence number (monotonically increasing) */
  readonly blockNumber: bigint;
  /** Proof generation timestamp (Unix ms) */
  readonly createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outbox & Settlement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status of an outbox entry in the settlement pipeline.
 */
export type OutboxEntryStatus =
  | "pending" // Awaiting settlement
  | "processing" // Settlement in progress
  | "settled" // Successfully settled
  | "failed"; // Settlement failed (may retry)

/**
 * An entry in the settlement outbox queue.
 *
 * Created after a Tier-2 block proof is generated.
 * One entry per asset type per block proof.
 */
export interface OutboxEntry {
  /** Unique entry identifier (UUID v4) */
  readonly entryId: string;
  /** Block proof this entry settles */
  readonly blockProofId: string;
  /** Asset type for this settlement */
  readonly assetType: AssetType;
  /** Net transfers to execute (computed from block transactions) */
  readonly netTransfers: readonly NetTransfer[];
  /** Current settlement status */
  readonly status: OutboxEntryStatus;
  /** Number of retry attempts */
  readonly retryCount: number;
  /** Maximum retries before marking as failed */
  readonly maxRetries: number;
  /** Entry creation timestamp (Unix ms) */
  readonly createdAt: number;
  /** Settlement completion timestamp (Unix ms, null if not settled) */
  readonly settledAt: number | null;
  /** External settlement transaction ID (null if not settled) */
  readonly settlementTxId: string | null;
  /** Error message if failed */
  readonly errorMessage: string | null;
  /** Outbox offset for exactly-once consumption */
  readonly offset: bigint;
}

/**
 * A net transfer to an external address.
 *
 * Computed by netting all transactions in a block for a given address.
 * Positive amount = credit, negative = debit.
 */
export interface NetTransfer {
  /** External address to transfer to/from */
  readonly externalAddress: string;
  /** Net amount (positive = credit, negative = debit) */
  readonly netAmount: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
// Settlement Results (Per-Chain)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a Solana settlement transaction.
 */
export interface SolanaSettlementResult {
  /** Transaction signature (base58) */
  readonly signature: string;
  /** Slot number where transaction was confirmed */
  readonly slot: number;
  /** Address Lookup Table used for compression */
  readonly lookupTableAddress: string;
  /** Compute units consumed */
  readonly computeUnits: number;
  /** Fee paid (lamports) */
  readonly fee: bigint;
  /** Block proof commitment included in memo */
  readonly proofCommitment: string;
}

/**
 * Result of a Bitcoin settlement transaction.
 */
export interface BitcoinSettlementResult {
  /** Transaction ID (hex) */
  readonly txid: string;
  /** Signed PSBT (base64) for audit */
  readonly psbtBase64: string;
  /** UTXOs spent in this transaction */
  readonly utxosSpent: readonly string[];
  /** Total fee paid (satoshis) */
  readonly fee: bigint;
  /** OP_RETURN data with proof commitment */
  readonly opReturnData: string;
  /** Number of confirmations (at query time) */
  readonly confirmations: number;
}

/**
 * Result of a fiat settlement (mock ISO 20022).
 */
export interface FiatSettlementResult {
  /** ISO 20022 message ID */
  readonly iso20022MessageId: string;
  /** pain.001 credit transfer XML */
  readonly pain001Xml: string;
  /** Settlement date (ISO 8601) */
  readonly settlementDate: string;
  /** Total amount (cents) */
  readonly totalAmount: bigint;
  /** Number of transactions in batch */
  readonly transactionCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deposit Events (Inbound Mirroring)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An inbound deposit detected on an external chain.
 */
export interface DepositEvent {
  /** Unique event identifier */
  readonly eventId: string;
  /** Asset type */
  readonly assetType: AssetType;
  /** External address that received the deposit */
  readonly externalAddress: string;
  /** Amount deposited (atomic units) */
  readonly amount: bigint;
  /** External transaction ID */
  readonly externalTxId: string;
  /** Number of confirmations */
  readonly confirmations: number;
  /** Event detection timestamp (Unix ms) */
  readonly detectedAt: number;
  /** Whether this deposit has been mirrored to the ledger */
  readonly mirrored: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consensus & HA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raft node state for HA cluster.
 */
export type RaftState = "follower" | "candidate" | "leader";

/**
 * Raft cluster node information.
 */
export interface RaftNode {
  /** Node identifier */
  readonly nodeId: string;
  /** Node state */
  readonly state: RaftState;
  /** Current term */
  readonly term: bigint;
  /** Voted for in current term (null if not voted) */
  readonly votedFor: string | null;
  /** Last log index */
  readonly lastLogIndex: bigint;
  /** Commit index */
  readonly commitIndex: bigint;
  /** Last heartbeat timestamp (Unix ms) */
  readonly lastHeartbeat: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit & Compliance
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit record for compliance reporting.
 */
export interface AuditRecord {
  /** Unique record identifier */
  readonly recordId: string;
  /** Event type */
  readonly eventType:
    | "transaction_submitted"
    | "proof_generated"
    | "proof_aggregated"
    | "settlement_initiated"
    | "settlement_confirmed"
    | "settlement_failed";
  /** Related entity ID (txId, proofId, entryId) */
  readonly entityId: string;
  /** Entity type */
  readonly entityType:
    | "transaction"
    | "base_proof"
    | "tier1_proof"
    | "tier2_proof"
    | "outbox_entry";
  /** Actor who triggered the event (public key hash) */
  readonly actor: string;
  /** Event timestamp (Unix ms) */
  readonly timestamp: number;
  /** Additional event data */
  readonly data: Readonly<Record<string, unknown>>;
  /** SHA-256 hash of the previous audit record (chain integrity) */
  readonly previousHash: string;
  /** SHA-256 hash of this record */
  readonly recordHash: string;
}
