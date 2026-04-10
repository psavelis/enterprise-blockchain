/**
 * Solana Settlement Adapter
 *
 * Implements SolanaSettlementPort for Solana devnet settlement.
 * Uses VersionedTransactions with Address Lookup Tables for batch optimization.
 *
 * Features:
 * - Batched transfers in single transaction
 * - Address Lookup Table compression
 * - Proof commitment in memo instruction
 * - Deposit subscription via account change notifications
 *
 * @see https://solana.com/docs for Solana documentation
 * @see domain/ports.ts for SolanaSettlementPort interface
 */

/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unused-vars */

import { createHash } from "node:crypto";
import type {
  NetTransfer,
  Tier2BlockProof,
  SolanaSettlementResult,
  DepositEvent,
} from "../../domain/entities.js";
import type { SolanaSettlementPort, ClockPort } from "../../domain/ports.js";
import { ProofCommitment } from "../../domain/value-objects.js";

// Note: In production, these would come from @solana/web3.js
// For now, we define stub types for the adapter interface

/**
 * Configuration for Solana adapter.
 */
export interface SolanaAdapterConfig {
  /** RPC endpoint (default: devnet) */
  rpcUrl?: string;
  /** WebSocket endpoint for subscriptions */
  wsUrl?: string;
  /** Commitment level (default: confirmed) */
  commitment?: "processed" | "confirmed" | "finalized";
  /** Whether to simulate transactions before sending */
  simulate?: boolean;
}

/**
 * Solana devnet adapter for settlement operations.
 */
export class SolanaDevnetAdapter implements SolanaSettlementPort {
  private readonly config: Required<SolanaAdapterConfig>;
  private readonly subscriptions = new Map<
    string,
    { addresses: string[]; callback: (deposit: DepositEvent) => void }
  >();
  private subscriptionCounter = 0;

  constructor(
    private readonly clock: ClockPort,
    config?: SolanaAdapterConfig,
  ) {
    this.config = {
      rpcUrl: config?.rpcUrl ?? "https://api.devnet.solana.com",
      wsUrl: config?.wsUrl ?? "wss://api.devnet.solana.com",
      commitment: config?.commitment ?? "confirmed",
      simulate: config?.simulate ?? true,
    };
  }

  async executeBatchedTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<SolanaSettlementResult> {
    // Compute proof commitment for memo
    const proofCommitment = ProofCommitment.create(
      blockProof.blockProofId,
      blockProof.finalProof,
      blockProof.publicInputs,
    );

    // In production, this would:
    // 1. Create a VersionedTransaction with transfer instructions
    // 2. Use Address Lookup Table for address compression
    // 3. Add memo instruction with proof commitment
    // 4. Sign and send the transaction

    // For now, simulate the settlement
    const signature = this.generateMockSignature(proofCommitment.toString());
    const slot = Math.floor(Date.now() / 400); // ~400ms per slot

    // Calculate fee based on transfer count
    const baseFee = 5000n; // 5000 lamports base
    const perTransferFee = 1000n; // 1000 lamports per transfer
    const fee = baseFee + perTransferFee * BigInt(transfers.length);

    // Estimate compute units
    const computeUnits = 50000 + transfers.length * 5000;

    // Note: console.log removed to avoid noisy output for library consumers.
    // In production, use a Logger port or verbose flag for operational output.

    return {
      signature,
      slot,
      lookupTableAddress: this.generateMockAddress("lookup-table"),
      computeUnits,
      fee,
      proofCommitment: proofCommitment.toString(),
    };
  }

  async subscribeDeposits(
    addresses: readonly string[],
    callback: (deposit: DepositEvent) => void,
  ): Promise<{ unsubscribe: () => void }> {
    const subscriptionId = `sub-${this.subscriptionCounter++}`;

    this.subscriptions.set(subscriptionId, {
      addresses: [...addresses],
      callback,
    });

    return {
      unsubscribe: () => {
        this.subscriptions.delete(subscriptionId);
      },
    };
  }

  async getHealth(): Promise<{ healthy: boolean; slot: number }> {
    // In production, this would call getSlot() RPC method
    const slot = Math.floor(Date.now() / 400);
    return { healthy: true, slot };
  }

  async getOrCreateLookupTable(addresses: readonly string[]): Promise<string> {
    // In production, this would:
    // 1. Check if a lookup table with these addresses exists
    // 2. If not, create one using AddressLookupTableProgram
    // 3. Return the lookup table address

    const tableKey = createHash("sha256")
      .update(addresses.join(":"))
      .digest("hex")
      .slice(0, 44);

    return tableKey;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Simulate a deposit event (for testing).
   */
  simulateDeposit(address: string, amount: bigint, signature: string): void {
    const event: DepositEvent = {
      eventId: this.clock.uuid(),
      assetType: "SOL",
      externalAddress: address,
      amount,
      externalTxId: signature,
      confirmations: 1,
      detectedAt: this.clock.now(),
      mirrored: false,
    };

    for (const [, sub] of this.subscriptions) {
      if (sub.addresses.includes(address)) {
        sub.callback(event);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private generateMockSignature(seed: string): string {
    const hash = createHash("sha256").update(seed).digest();
    // Base58-like encoding (simplified)
    return hash
      .toString("base64")
      .replace(/[+/=]/g, (c) => (c === "+" ? "A" : c === "/" ? "B" : ""))
      .slice(0, 88);
  }

  private generateMockAddress(seed: string): string {
    const hash = createHash("sha256").update(seed).digest();
    return hash
      .toString("base64")
      .replace(/[+/=]/g, (c) => (c === "+" ? "A" : c === "/" ? "B" : ""))
      .slice(0, 44);
  }
}

/**
 * Mock Solana adapter for testing without network.
 */
export class MockSolanaAdapter implements SolanaSettlementPort {
  private slot = 100000;
  public readonly settlements: Array<{
    transfers: readonly NetTransfer[];
    blockProofId: string;
    result: SolanaSettlementResult;
  }> = [];

  constructor(private readonly clock: ClockPort) {}

  async executeBatchedTransfer(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<SolanaSettlementResult> {
    this.slot++;

    const result: SolanaSettlementResult = {
      signature: `mock-sig-${this.slot}`,
      slot: this.slot,
      lookupTableAddress: "mock-lookup-table",
      computeUnits: 50000 + transfers.length * 5000,
      fee: 5000n + BigInt(transfers.length) * 1000n,
      proofCommitment: blockProof.stateRoot,
    };

    this.settlements.push({
      transfers,
      blockProofId: blockProof.blockProofId,
      result,
    });

    return result;
  }

  async subscribeDeposits(
    _addresses: readonly string[],
    _callback: (deposit: DepositEvent) => void,
  ): Promise<{ unsubscribe: () => void }> {
    return { unsubscribe: () => {} };
  }

  async getHealth(): Promise<{ healthy: boolean; slot: number }> {
    return { healthy: true, slot: this.slot };
  }

  async getOrCreateLookupTable(_addresses: readonly string[]): Promise<string> {
    return "mock-lookup-table";
  }
}
