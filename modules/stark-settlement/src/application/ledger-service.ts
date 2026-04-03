/**
 * Ledger Service
 *
 * Orchestrates the ZKP ledger operations:
 * - Account management (create, query, update)
 * - Transaction submission with ML-DSA-65 signing
 * - State transition proof generation
 * - Audit logging
 *
 * All transactions are signed with post-quantum ML-DSA-65 signatures.
 *
 * @see domain/ports.ts for port interfaces
 */

import { createHash } from "node:crypto";

import type {
  AssetType,
  MirrorAccount,
  LedgerTransaction,
  TransactionPayload,
  TransactionType,
  BaseProof,
} from "../domain/entities";
import type { SettlementContext } from "../index";
import { StateRoot } from "../domain/value-objects";

/**
 * Options for creating a mirror account.
 */
export interface CreateAccountOptions {
  /** External chain address (Solana pubkey, BTC address, fiat account) */
  externalAddress: string;
  /** Asset type */
  assetType: AssetType;
  /** Initial balance (default: 0) */
  initialBalance?: bigint;
  /** Optional metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for submitting a transaction.
 */
export interface SubmitTransactionOptions {
  /** Transaction type */
  type: TransactionType;
  /** Source account ID (required for transfer/withdrawal) */
  fromAccountId?: string;
  /** Destination account ID (required for deposit/transfer) */
  toAccountId?: string;
  /** Asset type */
  assetType: AssetType;
  /** Amount in atomic units */
  amount: bigint;
  /** Signer's secret key (ML-DSA-65) */
  signerSecretKey: Uint8Array;
  /** Signer's public key (ML-DSA-65) */
  signerPublicKey: Uint8Array;
  /** Optional metadata */
  metadata?: Record<string, string>;
  /** Optional idempotency key (auto-generated if not provided) */
  idempotencyKey?: string;
}

/**
 * Result of submitting a transaction.
 */
export interface SubmitTransactionResult {
  /** The submitted transaction */
  transaction: LedgerTransaction;
  /** The base proof for this transaction */
  baseProof: BaseProof;
  /** Whether this was a duplicate (idempotent replay) */
  isDuplicate: boolean;
}

/**
 * Ledger service for managing accounts and transactions.
 */
export class LedgerService {
  private currentStateRoot: StateRoot;

  constructor(private readonly ctx: SettlementContext) {
    this.currentStateRoot = StateRoot.genesis();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Account Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new mirror account.
   */
  async createAccount(options: CreateAccountOptions): Promise<MirrorAccount> {
    const now = this.ctx.clock.now();
    const id = this.ctx.clock.uuid();

    const account: MirrorAccount = {
      id,
      externalAddress: options.externalAddress,
      assetType: options.assetType,
      balance: options.initialBalance ?? 0n,
      lastProofRoot: this.currentStateRoot.toString().replace("0x", ""),
      createdAt: now,
      updatedAt: now,
      isActive: true,
      metadata: options.metadata ?? {},
    };

    await this.ctx.ledgerStore.createAccount(account);

    // Update state root to reflect new account
    this.currentStateRoot = this.currentStateRoot.hash(
      new TextEncoder().encode(serializeWithBigInt(account)),
    );

    // Emit event
    this.ctx.events.emit({
      type: "transaction:submitted",
      tx: {
        txId: `account-creation-${id}`,
        type: "deposit",
        fromAccountId: null,
        toAccountId: id,
        assetType: options.assetType,
        amount: options.initialBalance ?? 0n,
        idempotencyKey: `account-creation-${id}`,
        mlDsaSignature: new Uint8Array(0),
        mlDsaPublicKeyHash: "",
        status: "finalized",
        metadata: { accountCreation: "true" },
        createdAt: now,
        updatedAt: now,
      },
    });

    return account;
  }

  /**
   * Get an account by ID.
   */
  async getAccount(accountId: string): Promise<MirrorAccount | null> {
    return this.ctx.ledgerStore.getAccount(accountId);
  }

  /**
   * Get an account by external address and asset type.
   */
  async getAccountByAddress(
    externalAddress: string,
    assetType: AssetType,
  ): Promise<MirrorAccount | null> {
    return this.ctx.ledgerStore.getAccountByAddress(externalAddress, assetType);
  }

  /**
   * Get all accounts for an asset type.
   */
  async getAccountsByAssetType(
    assetType: AssetType,
  ): Promise<readonly MirrorAccount[]> {
    return this.ctx.ledgerStore.getAccountsByAssetType(assetType);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transaction Submission
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Submit a transaction to the ledger.
   *
   * The transaction is:
   * 1. Validated (balances, account existence)
   * 2. Signed with ML-DSA-65
   * 3. Recorded in the ledger
   * 4. A base STARK proof is generated
   * 5. Account balances are updated
   *
   * @returns The transaction and its base proof
   * @throws If validation fails
   */
  async submitTransaction(
    options: SubmitTransactionOptions,
  ): Promise<SubmitTransactionResult> {
    const now = this.ctx.clock.now();
    const txId = this.ctx.clock.uuid();

    // Generate idempotency key if not provided
    const idempotencyKey =
      options.idempotencyKey ??
      createHash("sha256").update(`${txId}:${now}`).digest("hex");

    // Check for duplicate (idempotent replay)
    const existingTxs =
      await this.ctx.ledgerStore.getTransactionsByIdempotencyKey(
        idempotencyKey,
      );
    if (existingTxs.length > 0) {
      const existingTx = existingTxs[0]!;
      // Look up proof using the proofId stored on the transaction (if present)
      // or fall back to the deterministic proof ID pattern for backward compatibility
      const txWithProofId = existingTx as LedgerTransaction & {
        proofId?: string;
      };
      const proofId = txWithProofId.proofId ?? `proof-${existingTx.txId}`;
      const existingProof = await this.ctx.ledgerStore.getBaseProof(proofId);
      if (existingProof) {
        return {
          transaction: existingTx,
          baseProof: existingProof,
          isDuplicate: true,
        };
      }
    }

    // Validate transaction
    await this.validateTransaction(options);

    // Create transaction payload for signing
    const payload: TransactionPayload = {
      txId,
      type: options.type,
      fromAccountId: options.fromAccountId ?? null,
      toAccountId: options.toAccountId ?? null,
      assetType: options.assetType,
      amount: options.amount.toString(),
      idempotencyKey,
      createdAt: now,
    };

    // Sign with ML-DSA-65
    const signature = this.ctx.transactionSigning.signPayload(
      payload,
      options.signerSecretKey,
    );
    const publicKeyHash = this.ctx.dilithium.hashPublicKey(
      options.signerPublicKey,
    );

    // Create transaction record
    const transaction: LedgerTransaction = {
      txId,
      type: options.type,
      fromAccountId: options.fromAccountId ?? null,
      toAccountId: options.toAccountId ?? null,
      assetType: options.assetType,
      amount: options.amount,
      idempotencyKey,
      mlDsaSignature: signature,
      mlDsaPublicKeyHash: publicKeyHash,
      status: "pending",
      metadata: options.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    // Save transaction
    await this.ctx.ledgerStore.appendTransaction(transaction);

    // Compute state transition
    const preStateRoot = this.currentStateRoot.toString().replace("0x", "");
    await this.applyTransaction(transaction);
    const postStateRoot = this.currentStateRoot.toString().replace("0x", "");

    // Generate base STARK proof
    const baseProof = await this.ctx.starkProver.generateBaseProof(
      transaction,
      preStateRoot,
      postStateRoot,
    );

    // Save base proof
    await this.ctx.ledgerStore.saveBaseProof(baseProof);

    // Update transaction status
    await this.ctx.ledgerStore.updateTransactionStatus(txId, "proved");

    // Create updated transaction with correct status for return/events
    const provedTransaction: LedgerTransaction = {
      ...transaction,
      status: "proved",
      updatedAt: this.ctx.clock.now(),
    };

    // Log audit record
    await this.ctx.auditLog.append({
      eventType: "transaction_submitted",
      entityId: txId,
      entityType: "transaction",
      actor: publicKeyHash,
      timestamp: now,
      data: {
        type: options.type,
        assetType: options.assetType,
        amount: options.amount.toString(),
        preStateRoot,
        postStateRoot,
      },
    });

    // Emit event with updated transaction
    this.ctx.events.emit({
      type: "transaction:submitted",
      tx: provedTransaction,
    });
    this.ctx.events.emit({ type: "proof:base:generated", proof: baseProof });

    return {
      transaction: provedTransaction,
      baseProof,
      isDuplicate: false,
    };
  }

  /**
   * Get pending transactions that need proof generation.
   */
  async getPendingTransactions(
    limit = 1000,
  ): Promise<readonly LedgerTransaction[]> {
    return this.ctx.ledgerStore.getPendingTransactions(limit);
  }

  /**
   * Get the current state root.
   */
  getCurrentStateRoot(): StateRoot {
    return this.currentStateRoot;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async validateTransaction(
    options: SubmitTransactionOptions,
  ): Promise<void> {
    // Validate based on transaction type
    switch (options.type) {
      case "deposit":
        if (!options.toAccountId) {
          throw new Error("Deposit requires toAccountId");
        }
        await this.validateAccountExists(
          options.toAccountId,
          options.assetType,
        );
        break;

      case "withdrawal":
        if (!options.fromAccountId) {
          throw new Error("Withdrawal requires fromAccountId");
        }
        await this.validateAccountExists(
          options.fromAccountId,
          options.assetType,
        );
        await this.validateSufficientBalance(
          options.fromAccountId,
          options.amount,
        );
        break;

      case "transfer":
        if (!options.fromAccountId || !options.toAccountId) {
          throw new Error(
            "Transfer requires both fromAccountId and toAccountId",
          );
        }
        await this.validateAccountExists(
          options.fromAccountId,
          options.assetType,
        );
        await this.validateAccountExists(
          options.toAccountId,
          options.assetType,
        );
        await this.validateSufficientBalance(
          options.fromAccountId,
          options.amount,
        );
        break;
    }

    // Validate amount is positive
    if (options.amount <= 0n) {
      throw new Error("Amount must be positive");
    }

    // Verify signature is valid
    const payload: TransactionPayload = {
      txId: "validation-check",
      type: options.type,
      fromAccountId: options.fromAccountId ?? null,
      toAccountId: options.toAccountId ?? null,
      assetType: options.assetType,
      amount: options.amount.toString(),
      idempotencyKey: "validation-check",
      createdAt: this.ctx.clock.now(),
    };

    const testSignature = this.ctx.transactionSigning.signPayload(
      payload,
      options.signerSecretKey,
    );
    const isValid = this.ctx.transactionSigning.verifyPayload(
      payload,
      testSignature,
      options.signerPublicKey,
    );

    if (!isValid) {
      throw new Error("Invalid signature");
    }
  }

  private async validateAccountExists(
    accountId: string,
    expectedAssetType: AssetType,
  ): Promise<void> {
    const account = await this.ctx.ledgerStore.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    if (account.assetType !== expectedAssetType) {
      throw new Error(
        `Account ${accountId} has asset type ${account.assetType}, expected ${expectedAssetType}`,
      );
    }
    if (!account.isActive) {
      throw new Error(`Account ${accountId} is not active`);
    }
  }

  private async validateSufficientBalance(
    accountId: string,
    amount: bigint,
  ): Promise<void> {
    const account = await this.ctx.ledgerStore.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    if (account.balance < amount) {
      throw new Error(`Insufficient balance: ${account.balance} < ${amount}`);
    }
  }

  private async applyTransaction(tx: LedgerTransaction): Promise<void> {
    // First, advance the state root to reflect the new transaction
    this.currentStateRoot = this.currentStateRoot.hash(
      new TextEncoder().encode(serializeWithBigInt(tx)),
    );

    // Use the post-transaction state root for account updates
    const postTxStateRoot = this.currentStateRoot.toString().replace("0x", "");

    switch (tx.type) {
      case "deposit":
        if (tx.toAccountId) {
          await this.ctx.ledgerStore.updateAccountBalance(
            tx.toAccountId,
            tx.amount,
            postTxStateRoot,
          );
        }
        break;

      case "withdrawal":
        if (tx.fromAccountId) {
          await this.ctx.ledgerStore.updateAccountBalance(
            tx.fromAccountId,
            -tx.amount,
            postTxStateRoot,
          );
        }
        break;

      case "transfer":
        if (tx.fromAccountId && tx.toAccountId) {
          await this.ctx.ledgerStore.updateAccountBalance(
            tx.fromAccountId,
            -tx.amount,
            postTxStateRoot,
          );
          await this.ctx.ledgerStore.updateAccountBalance(
            tx.toAccountId,
            tx.amount,
            postTxStateRoot,
          );
        }
        break;
    }
  }
}

/**
 * Serialize an object to JSON, converting BigInt values to strings.
 */
function serializeWithBigInt(obj: unknown): string {
  return JSON.stringify(obj, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}
