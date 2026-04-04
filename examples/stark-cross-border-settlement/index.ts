/**
 * Cross-Border Payment Settlement via Aggregated STARK Proofs
 *
 * This example demonstrates the complete 4-phase settlement flow:
 *
 * Phase 1: Key Ceremony & Account Setup
 *   - Generate ML-DSA-65 keypairs for all participants
 *   - Create mirror accounts for SOL, BTC, USD
 *
 * Phase 2: Transaction Batch Submission
 *   - Submit cross-border payment transactions
 *   - Each signed with ML-DSA-65 (post-quantum)
 *   - Base STARK proofs generated per transaction
 *
 * Phase 3: Recursive Proof Aggregation
 *   - Tier-1: Base proofs aggregated (configurable batch size)
 *   - Tier-2: Tier-1 proofs aggregated into final BlockProof
 *
 * Phase 4: Multi-Rail Settlement
 *   - Verify BlockProof off-chain
 *   - Compute net transfers per address
 *   - Solana: VersionedTransaction with lookup tables
 *   - Bitcoin: Batched PSBT spend
 *   - Fiat: ISO 20022 pain.001
 *
 * Run: npm run example:stark-settlement
 *      npx tsx examples/stark-cross-border-settlement/index.ts
 */

import {
  createDefaultContext,
  LedgerService,
  AggregatorService,
  SettlementService,
  MockSolanaAdapter,
  MockBitcoinAdapter,
  FiatMockAdapter,
  type AssetType,
  type MirrorAccount,
  type NetTransfer,
} from "../../modules/stark-settlement/src";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Use small batch sizes for demo (production: 128/64)
const TIER1_BATCH_SIZE = 4; // Transactions per Tier-1 proof
const TIER2_BATCH_SIZE = 2; // Tier-1 proofs per block
const TOTAL_TXS_PER_BLOCK = TIER1_BATCH_SIZE * TIER2_BATCH_SIZE; // 8 for demo

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║   Aggregated STARK Settlement Layer - Cross-Border Payments  ║",
  );
  console.log(
    "║   Recursive Proof Composition for Quantum-Safe Settlement    ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  // Initialize context with demo batch sizes
  const ctx = createDefaultContext({
    tier1BatchSize: TIER1_BATCH_SIZE,
    tier2BatchSize: TIER2_BATCH_SIZE,
  });

  // Initialize services
  const ledger = new LedgerService(ctx);
  const aggregator = new AggregatorService(ctx);
  const settler = new SettlementService(ctx);

  // Setup external chain adapters (mock for demo)
  const solanaAdapter = new MockSolanaAdapter(ctx.clock);
  const bitcoinAdapter = new MockBitcoinAdapter(ctx.clock);
  const fiatAdapter = new FiatMockAdapter(ctx.clock);

  settler.setSolanaAdapter(solanaAdapter);
  settler.setBitcoinAdapter(bitcoinAdapter);
  settler.setFiatAdapter(fiatAdapter);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Key Ceremony & Account Setup
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("PHASE 1: Key Ceremony & Account Setup");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  // Generate ML-DSA-65 keypairs for participants
  console.log("[1.1] Generating ML-DSA-65 keypairs for participants...\n");

  const participants = [
    { name: "Bank-A (Singapore)", role: "sender" },
    { name: "Bank-B (London)", role: "recipient" },
    { name: "Bank-C (New York)", role: "recipient" },
    { name: "Settlement Corp", role: "operator" },
  ].map((p) => {
    const keypair = ctx.dilithium.generateKeyPair();
    const publicKeyHash = ctx.dilithium.hashPublicKey(keypair.publicKey);
    console.log(`  ${p.name} (${p.role})`);
    console.log(`    Public key hash: ${publicKeyHash.slice(0, 32)}...`);
    console.log(
      `    Key size: ${keypair.publicKey.length} bytes (ML-DSA-65)\n`,
    );
    return { ...p, keypair, publicKeyHash };
  });

  // Create mirror accounts for each asset type
  console.log("[1.2] Creating mirror accounts...\n");

  const accounts: Map<string, MirrorAccount> = new Map();

  for (const participant of participants) {
    for (const assetType of ["SOL", "BTC", "USD"] as AssetType[]) {
      const account = await ledger.createAccount({
        externalAddress: `${participant.name.toLowerCase().replace(/[^a-z]/g, "")}-${assetType.toLowerCase()}`,
        assetType,
        initialBalance: assetType === "USD" ? 10000000n : 10000000000n, // 100k USD or 10 SOL/BTC
        metadata: { owner: participant.name, role: participant.role },
      });
      accounts.set(`${participant.name}:${assetType}`, account);
    }
  }

  console.log(
    `  Created ${accounts.size} mirror accounts across SOL/BTC/USD\n`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Transaction Batch Submission
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("PHASE 2: Transaction Batch Submission");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  console.log(
    `[2.1] Submitting ${TOTAL_TXS_PER_BLOCK} cross-border payments...\n`,
  );

  const sender = participants[0]!; // Bank-A
  const recipients = participants.slice(1, 3); // Bank-B, Bank-C
  const assetTypes: readonly AssetType[] = ["SOL", "BTC", "USD"] as const;

  // Submit transactions to fill one block
  for (let i = 0; i < TOTAL_TXS_PER_BLOCK; i++) {
    const recipient = recipients[i % recipients.length]!;
    const assetType = assetTypes[i % 3]!;

    const fromAccount = accounts.get(`${sender.name}:${assetType}`);
    const toAccount = accounts.get(`${recipient.name}:${assetType}`);

    if (!fromAccount || !toAccount) {
      throw new Error(
        `Account not found for ${sender.name} or ${recipient.name}`,
      );
    }

    const amount = assetType === "USD" ? 100000n : 100000000n; // $1000 or 0.1 SOL/BTC

    const result = await ledger.submitTransaction({
      type: "transfer",
      fromAccountId: fromAccount.id,
      toAccountId: toAccount.id,
      assetType,
      amount,
      signerSecretKey: sender.keypair.secretKey,
      signerPublicKey: sender.keypair.publicKey,
      metadata: {
        reference: `XBORDER-${i.toString().padStart(4, "0")}`,
        corridor: `${sender.name} -> ${recipient.name}`,
      },
    });

    console.log(
      `  TX ${i + 1}/${TOTAL_TXS_PER_BLOCK}: ${assetType} ${formatAmount(amount, assetType)}`,
    );
    console.log(`    ${sender.name} -> ${recipient.name}`);
    console.log(`    Base proof: ${result.baseProof.proofId.slice(0, 8)}...`);
    console.log(
      `    Pre-state:  ${result.baseProof.preStateRoot.slice(0, 16)}...`,
    );
    console.log(
      `    Post-state: ${result.baseProof.postStateRoot.slice(0, 16)}...\n`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Recursive Proof Aggregation
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("PHASE 3: Recursive Proof Aggregation");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  const batchSizes = aggregator.getBatchSizes();
  console.log(`[3.1] Aggregation configuration:`);
  console.log(`  Tier-1: ${batchSizes.tier1} base proofs -> 1 Tier-1 proof`);
  console.log(`  Tier-2: ${batchSizes.tier2} Tier-1 proofs -> 1 Block proof`);
  console.log(`  Total TXs per block: ${batchSizes.totalTxsPerBlock}\n`);

  console.log("[3.2] Processing aggregation pipeline...\n");

  const aggregationResult = await aggregator.processAggregation();

  if (!aggregationResult.blockGenerated) {
    console.log("  Not enough proofs for a block yet.");
    console.log(
      `  Base proofs processed: ${aggregationResult.baseProofsProcessed}`,
    );
    console.log(
      `  Tier-1 proofs generated: ${aggregationResult.tier1ProofsGenerated}`,
    );
    return;
  }

  const blockProof = aggregationResult.blockProof!;

  console.log(
    `  Tier-1 proofs generated: ${aggregationResult.tier1ProofsGenerated}`,
  );
  console.log(
    `  Base proofs aggregated: ${aggregationResult.baseProofsProcessed}`,
  );
  console.log(`\n  Block Proof Generated:`);
  console.log(`    ID: ${blockProof.blockProofId}`);
  console.log(`    Block #: ${blockProof.blockNumber}`);
  console.log(`    TX count: ${blockProof.txCount}`);
  console.log(`    State root: ${blockProof.stateRoot.slice(0, 32)}...`);
  console.log(`    Proof size: ${blockProof.finalProof.length} bytes`);
  console.log(`    Idempotency keys: ${blockProof.idempotencyKeys.length}\n`);

  // Verify block proof
  console.log("[3.3] Verifying block proof...\n");
  const isValid = await aggregator.verifyBlockProof(blockProof);
  console.log(`  Verification result: ${isValid ? "VALID" : "INVALID"}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: Multi-Rail Settlement
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("PHASE 4: Multi-Rail Settlement");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  // Compute net transfers by asset type
  console.log("[4.1] Computing net transfers...\n");

  const netTransfersByAsset = new Map<AssetType, NetTransfer[]>();

  // For demo, create mock net transfers based on transaction patterns
  for (const assetType of ["SOL", "BTC", "USD"] as AssetType[]) {
    const transfers: NetTransfer[] = [];

    // Net effect: sender loses, recipients gain
    for (const recipient of recipients) {
      const account = accounts.get(`${recipient.name}:${assetType}`);
      if (account) {
        const amount = assetType === "USD" ? 100000n : 100000000n;
        transfers.push({
          externalAddress: account.externalAddress,
          netAmount: amount,
        });
      }
    }

    if (transfers.length > 0) {
      netTransfersByAsset.set(assetType, transfers);
      console.log(`  ${assetType}: ${transfers.length} net transfers`);
      for (const t of transfers) {
        console.log(
          `    ${t.externalAddress}: +${formatAmount(t.netAmount, assetType)}`,
        );
      }
    }
  }

  // Create outbox entries
  console.log("\n[4.2] Creating outbox entries...\n");
  const outboxEntries = await aggregator.createOutboxEntries(
    blockProof,
    netTransfersByAsset,
  );
  console.log(`  Created ${outboxEntries.length} outbox entries\n`);

  // Settle all rails
  console.log("[4.3] Settling all rails...\n");
  const settlementResult = await settler.settleAllRails(blockProof);

  for (const result of settlementResult.results) {
    console.log(`  ${result.assetType}:`);
    if (result.success) {
      console.log(`    Status: SUCCESS`);
      if ("signature" in result.result) {
        console.log(
          `    Solana signature: ${result.result.signature.slice(0, 32)}...`,
        );
        console.log(`    Slot: ${result.result.slot}`);
        console.log(`    Fee: ${result.result.fee} lamports`);
      } else if ("txid" in result.result) {
        console.log(`    Bitcoin txid: ${result.result.txid.slice(0, 32)}...`);
        console.log(`    Fee: ${result.result.fee} satoshis`);
      } else {
        console.log(
          `    ISO 20022 Message ID: ${result.result.iso20022MessageId}`,
        );
        console.log(`    Settlement date: ${result.result.settlementDate}`);
      }
    } else {
      console.log(`    Status: FAILED`);
      console.log(`    Error: ${result.error}`);
    }
    console.log();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log(
    "═══════════════════════════════════════════════════════════════",
  );
  console.log("SETTLEMENT COMPLETE");
  console.log(
    "═══════════════════════════════════════════════════════════════\n",
  );

  console.log("Summary:");
  console.log(`  Transactions processed: ${blockProof.txCount}`);
  console.log(`  Block proof ID: ${blockProof.blockProofId}`);
  console.log(`  Settlement results: ${settlementResult.results.length} rails`);
  console.log(`  All succeeded: ${settlementResult.allSucceeded}`);
  console.log();

  // Security properties
  console.log("Security Properties:");
  console.log("  - All transactions signed with ML-DSA-65 (NIST FIPS 204)");
  console.log("  - STARK proofs provide zero-knowledge state transitions");
  console.log("  - Recursive aggregation: O(log n) verification complexity");
  console.log("  - Quantum-resistant: No elliptic curves in proof system");
  console.log(
    "  - Exactly-once: Idempotency keys propagated through all tiers",
  );
  console.log();

  // Output final JSON summary
  console.log("JSON Output:");
  console.log(
    JSON.stringify(
      {
        blockProof: {
          id: blockProof.blockProofId,
          blockNumber: blockProof.blockNumber.toString(),
          txCount: blockProof.txCount,
          stateRoot: blockProof.stateRoot,
          proofSize: blockProof.finalProof.length,
        },
        settlement: {
          allSucceeded: settlementResult.allSucceeded,
          results: settlementResult.results.map((r) => ({
            assetType: r.assetType,
            success: r.success,
            txId: r.success
              ? "signature" in r.result
                ? r.result.signature
                : "txid" in r.result
                  ? r.result.txid
                  : r.result.iso20022MessageId
              : null,
          })),
        },
        config: {
          tier1BatchSize: TIER1_BATCH_SIZE,
          tier2BatchSize: TIER2_BATCH_SIZE,
          totalTxsPerBlock: TOTAL_TXS_PER_BLOCK,
        },
      },
      null,
      2,
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatAmount(amount: bigint, assetType: AssetType): string {
  switch (assetType) {
    case "SOL":
      return `${Number(amount) / 1e9} SOL`;
    case "BTC":
      return `${Number(amount) / 1e8} BTC`;
    case "USD":
      return `$${Number(amount) / 100}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
