/**
 * In-Memory Ledger Store
 *
 * Implements LedgerPersistencePort for testing and demos.
 * Stores all data in memory with no persistence.
 *
 * @see domain/ports.ts for interface definition
 */

/* eslint-disable @typescript-eslint/require-await */

import type {
  AssetType,
  MirrorAccount,
  LedgerTransaction,
  BaseProof,
  Tier1Proof,
  Tier2BlockProof,
} from "../../domain/entities";
import type { LedgerPersistencePort } from "../../domain/ports";

/**
 * In-memory implementation of the ledger persistence port.
 */
export class InMemoryLedgerStore implements LedgerPersistencePort {
  private readonly accounts = new Map<string, MirrorAccount>();
  private readonly accountsByAddress = new Map<string, string>(); // address:asset -> accountId
  private readonly transactions = new Map<string, LedgerTransaction>();
  private readonly transactionsByIdempotencyKey = new Map<string, string[]>();
  private readonly baseProofs = new Map<string, BaseProof>();
  private readonly tier1Proofs = new Map<string, Tier1Proof>();
  private readonly tier2Proofs = new Map<string, Tier2BlockProof>();
  private readonly aggregatedBaseProofIds = new Set<string>();
  private readonly aggregatedTier1ProofIds = new Set<string>();

  // ─── Accounts ───────────────────────────────────────────────────────────

  async createAccount(account: MirrorAccount): Promise<void> {
    if (this.accounts.has(account.id)) {
      throw new Error(`Account ${account.id} already exists`);
    }

    const addressKey = `${account.externalAddress}:${account.assetType}`;
    if (this.accountsByAddress.has(addressKey)) {
      throw new Error(
        `Account for ${account.externalAddress}:${account.assetType} already exists`,
      );
    }

    this.accounts.set(account.id, account);
    this.accountsByAddress.set(addressKey, account.id);
  }

  async getAccount(accountId: string): Promise<MirrorAccount | null> {
    return this.accounts.get(accountId) ?? null;
  }

  async getAccountByAddress(
    externalAddress: string,
    assetType: AssetType,
  ): Promise<MirrorAccount | null> {
    const addressKey = `${externalAddress}:${assetType}`;
    const accountId = this.accountsByAddress.get(addressKey);
    if (!accountId) return null;
    return this.accounts.get(accountId) ?? null;
  }

  async updateAccountBalance(
    accountId: string,
    delta: bigint,
    newProofRoot: string,
  ): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const newBalance = account.balance + delta;
    if (newBalance < 0n) {
      throw new Error(
        `Insufficient balance: ${account.balance} + ${delta} = ${newBalance}`,
      );
    }

    const updatedAccount: MirrorAccount = {
      ...account,
      balance: newBalance,
      lastProofRoot: newProofRoot,
      updatedAt: Date.now(),
    };

    this.accounts.set(accountId, updatedAccount);
  }

  async getAccountsByAssetType(
    assetType: AssetType,
  ): Promise<readonly MirrorAccount[]> {
    const accounts: MirrorAccount[] = [];
    for (const account of this.accounts.values()) {
      if (account.assetType === assetType) {
        accounts.push(account);
      }
    }
    return accounts;
  }

  // ─── Transactions ───────────────────────────────────────────────────────

  async appendTransaction(tx: LedgerTransaction): Promise<void> {
    if (this.transactions.has(tx.txId)) {
      throw new Error(`Transaction ${tx.txId} already exists`);
    }

    this.transactions.set(tx.txId, tx);

    // Index by idempotency key
    const existingTxIds =
      this.transactionsByIdempotencyKey.get(tx.idempotencyKey) ?? [];
    this.transactionsByIdempotencyKey.set(tx.idempotencyKey, [
      ...existingTxIds,
      tx.txId,
    ]);
  }

  async getTransaction(txId: string): Promise<LedgerTransaction | null> {
    return this.transactions.get(txId) ?? null;
  }

  async getTransactionsByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<readonly LedgerTransaction[]> {
    const txIds = this.transactionsByIdempotencyKey.get(idempotencyKey) ?? [];
    const transactions: LedgerTransaction[] = [];
    for (const txId of txIds) {
      const tx = this.transactions.get(txId);
      if (tx) transactions.push(tx);
    }
    return transactions;
  }

  async getPendingTransactions(
    limit: number,
  ): Promise<readonly LedgerTransaction[]> {
    const pending: LedgerTransaction[] = [];
    for (const tx of this.transactions.values()) {
      if (tx.status === "pending") {
        pending.push(tx);
        if (pending.length >= limit) break;
      }
    }
    // Sort by createdAt for deterministic ordering
    return pending.sort((a, b) => a.createdAt - b.createdAt);
  }

  async updateTransactionStatus(
    txId: string,
    status: LedgerTransaction["status"],
  ): Promise<void> {
    const tx = this.transactions.get(txId);
    if (!tx) {
      throw new Error(`Transaction ${txId} not found`);
    }

    const updatedTx: LedgerTransaction = {
      ...tx,
      status,
      updatedAt: Date.now(),
    };

    this.transactions.set(txId, updatedTx);
  }

  // ─── Base Proofs ────────────────────────────────────────────────────────

  async saveBaseProof(proof: BaseProof): Promise<void> {
    if (this.baseProofs.has(proof.proofId)) {
      throw new Error(`Base proof ${proof.proofId} already exists`);
    }
    this.baseProofs.set(proof.proofId, proof);
  }

  async getBaseProof(proofId: string): Promise<BaseProof | null> {
    return this.baseProofs.get(proofId) ?? null;
  }

  async getUnaggreatedBaseProofs(limit: number): Promise<readonly BaseProof[]> {
    const proofs: BaseProof[] = [];
    for (const proof of this.baseProofs.values()) {
      if (!this.aggregatedBaseProofIds.has(proof.proofId)) {
        proofs.push(proof);
        if (proofs.length >= limit) break;
      }
    }
    // Sort by createdAt for deterministic ordering
    return proofs.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Mark base proofs as aggregated (internal method for aggregator).
   */
  markBaseProofsAggregated(proofIds: readonly string[]): void {
    for (const proofId of proofIds) {
      this.aggregatedBaseProofIds.add(proofId);
    }
  }

  // ─── Tier-1 Proofs ──────────────────────────────────────────────────────

  async saveTier1Proof(proof: Tier1Proof): Promise<void> {
    if (this.tier1Proofs.has(proof.proofId)) {
      throw new Error(`Tier-1 proof ${proof.proofId} already exists`);
    }
    this.tier1Proofs.set(proof.proofId, proof);

    // Mark base proofs as aggregated
    this.markBaseProofsAggregated(proof.baseProofIds);
  }

  async getTier1Proof(proofId: string): Promise<Tier1Proof | null> {
    return this.tier1Proofs.get(proofId) ?? null;
  }

  async getUnaggreatedTier1Proofs(
    limit: number,
  ): Promise<readonly Tier1Proof[]> {
    const proofs: Tier1Proof[] = [];
    for (const proof of this.tier1Proofs.values()) {
      if (!this.aggregatedTier1ProofIds.has(proof.proofId)) {
        proofs.push(proof);
        if (proofs.length >= limit) break;
      }
    }
    // Sort by createdAt for deterministic ordering
    return proofs.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Mark Tier-1 proofs as aggregated (internal method for aggregator).
   */
  markTier1ProofsAggregated(proofIds: readonly string[]): void {
    for (const proofId of proofIds) {
      this.aggregatedTier1ProofIds.add(proofId);
    }
  }

  // ─── Tier-2 Proofs ──────────────────────────────────────────────────────

  async saveTier2Proof(proof: Tier2BlockProof): Promise<void> {
    if (this.tier2Proofs.has(proof.blockProofId)) {
      throw new Error(`Tier-2 proof ${proof.blockProofId} already exists`);
    }
    this.tier2Proofs.set(proof.blockProofId, proof);

    // Mark Tier-1 proofs as aggregated
    this.markTier1ProofsAggregated(proof.tier1ProofIds);
  }

  async getTier2Proof(blockProofId: string): Promise<Tier2BlockProof | null> {
    return this.tier2Proofs.get(blockProofId) ?? null;
  }

  async getLatestBlockProof(): Promise<Tier2BlockProof | null> {
    let latest: Tier2BlockProof | null = null;
    for (const proof of this.tier2Proofs.values()) {
      if (!latest || proof.blockNumber > latest.blockNumber) {
        latest = proof;
      }
    }
    return latest;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get statistics about the store (for debugging/monitoring).
   */
  getStats(): {
    accounts: number;
    transactions: number;
    baseProofs: number;
    tier1Proofs: number;
    tier2Proofs: number;
    aggregatedBaseProofs: number;
    aggregatedTier1Proofs: number;
  } {
    return {
      accounts: this.accounts.size,
      transactions: this.transactions.size,
      baseProofs: this.baseProofs.size,
      tier1Proofs: this.tier1Proofs.size,
      tier2Proofs: this.tier2Proofs.size,
      aggregatedBaseProofs: this.aggregatedBaseProofIds.size,
      aggregatedTier1Proofs: this.aggregatedTier1ProofIds.size,
    };
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.accounts.clear();
    this.accountsByAddress.clear();
    this.transactions.clear();
    this.transactionsByIdempotencyKey.clear();
    this.baseProofs.clear();
    this.tier1Proofs.clear();
    this.tier2Proofs.clear();
    this.aggregatedBaseProofIds.clear();
    this.aggregatedTier1ProofIds.clear();
  }
}
