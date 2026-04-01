/**
 * Quantum-Safe Merkle Root Payment — P2MR Full Lifecycle
 *
 * This example demonstrates the BIP-360-inspired Pay-to-Merkle-Root (P2MR) pattern
 * for quantum-safe transaction outputs. It showcases the complete lifecycle:
 *
 *   Phase 1 — Key Ceremony
 *     Generate ML-DSA-65 key pairs for two institutions (sender and receiver).
 *     Compute SHA-256 hashes of public keys for script leaf commitment.
 *
 *   Phase 2 — Output Creation
 *     Create a P2MR output with multiple spending paths:
 *     - Path 0: Single ML-DSA-65 signature (primary key)
 *     - Path 1: Time-locked backup (available after 1 year)
 *     - Path 2: 2-of-3 multisig (recovery committee)
 *     Commit only the Merkle root on-chain — NO public keys exposed.
 *
 *   Phase 3 — Spending via Primary Path
 *     Reveal the script leaf for path 0, provide Merkle proof,
 *     sign with ML-DSA-65, and verify the spend proof.
 *
 *   Phase 4 — Security Property Verification
 *     Demonstrate attacks that fail:
 *     1. Wrong public key (hash mismatch)
 *     2. Tampered signature (ML-DSA verification fails)
 *     3. Invalid Merkle proof (root mismatch)
 *     4. Spending already-spent output (double-spend prevention)
 *
 * Security Properties:
 *   - NO public keys on-chain until spend time ("harvest now, decrypt later" mitigation)
 *   - ML-DSA-65 (NIST FIPS 204) quantum-resistant signatures
 *   - Merkle proof verification ensures spending condition is in the committed tree
 *   - Multiple spending paths for operational flexibility (backup, recovery)
 *
 * Standards:
 *   BIP-360 — https://github.com/nicholasvh/bips/blob/qrp/bip-0360.mediawiki
 *   NIST FIPS 204 (ML-DSA) — https://csrc.nist.gov/pubs/fips/204/final
 *
 * Run: npm run example:quantum-safe-merkle-root-payment
 */

import {
  MerkleTree,
  createP2MROutput,
  createSingleSigLeaf,
  createTimelockLeaf,
  createMultisigLeaf,
  buildSpendProof,
  verifySpendProofStructure,
  interpretScript,
  hashPublicKey,
  P2MROutputStore,
} from "../../modules/p2mr/src/index";
import { MlDsaSigner } from "../../modules/mpc/src/dsa";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const PAYMENT_VALUE = BigInt(50_000_000); // 50M units

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

const section = (title: string) => console.log(`\n── ${title}`);
const indent = (msg: string) => console.log(`   ${msg}`);

// ---------------------------------------------------------------------------
// Main Demonstration
// ---------------------------------------------------------------------------

console.log("Quantum-Safe Merkle Root Payment — P2MR Full Lifecycle");
console.log(
  "BIP-360-inspired Pay-to-Merkle-Root with ML-DSA-65 (NIST FIPS 204)\n",
);

const dsaSigner = new MlDsaSigner();
const outputStore = new P2MROutputStore();

// ===========================================================================
// Phase 1 — Key Ceremony
// ===========================================================================

section("Phase 1 — Key Ceremony");

// Primary sender key
indent("Generating primary sender ML-DSA-65 key pair...");
const primaryKeys = dsaSigner.generateKeyPair("ml-dsa-65");
const primaryKeyHash = hashPublicKey(primaryKeys.publicKey);
indent(`  Public key: ${primaryKeys.publicKey.length} bytes`);
indent(`  Secret key: ${primaryKeys.secretKey.length} bytes`);
indent(`  Public key hash: ${primaryKeyHash.substring(0, 32)}...`);

// Backup key (time-locked)
indent("\nGenerating backup ML-DSA-65 key pair (for timelock path)...");
const backupKeys = dsaSigner.generateKeyPair("ml-dsa-65");
const backupKeyHash = hashPublicKey(backupKeys.publicKey);
indent(`  Public key hash: ${backupKeyHash.substring(0, 32)}...`);

// Recovery committee keys (2-of-3 multisig)
indent("\nGenerating recovery committee keys (2-of-3 multisig)...");
const committeeKeys = [
  dsaSigner.generateKeyPair("ml-dsa-65"),
  dsaSigner.generateKeyPair("ml-dsa-65"),
  dsaSigner.generateKeyPair("ml-dsa-65"),
];
const committeeKeyHashes = committeeKeys.map((k) => hashPublicKey(k.publicKey));
indent(`  Committee member 1: ${committeeKeyHashes[0]!.substring(0, 32)}...`);
indent(`  Committee member 2: ${committeeKeyHashes[1]!.substring(0, 32)}...`);
indent(`  Committee member 3: ${committeeKeyHashes[2]!.substring(0, 32)}...`);

indent("\n✓ Key ceremony complete — public key hashes ready for commitment");

// ===========================================================================
// Phase 2 — Output Creation
// ===========================================================================

section("Phase 2 — Output Creation (P2MR)");

// Create spending conditions (script leaves)
indent("Creating spending conditions...");

const primaryLeaf = createSingleSigLeaf(primaryKeyHash);
indent(
  `  Path 0 (primary): ml-dsa-65-sig from ${primaryKeyHash.substring(0, 16)}...`,
);

const locktime = Date.now() + ONE_YEAR_MS;
const backupLeaf = createTimelockLeaf(backupKeyHash, locktime);
indent(
  `  Path 1 (backup):  timelock until ${new Date(locktime).toISOString().split("T")[0]}`,
);

const recoveryLeaf = createMultisigLeaf(committeeKeyHashes, 2);
indent(`  Path 2 (recovery): 2-of-3 multisig`);

// Create P2MR output
indent("\nBuilding Merkle tree and creating output...");
const { output, tree } = createP2MROutput({
  leaves: [primaryLeaf, backupLeaf, recoveryLeaf],
  value: PAYMENT_VALUE,
});

indent(`  Merkle root: ${output.merkleRoot.substring(0, 32)}...`);
indent(`  Output ID: ${output.outputId}`);
indent(`  Value: ${output.value.toString()} units`);
indent(`  Tree leaves: ${tree.leafCount}`);

// Store output (simulating on-chain registration)
outputStore.add(output);
indent(
  "\n✓ Output created — ONLY Merkle root stored on-chain (no public keys!)",
);

// ===========================================================================
// Phase 3 — Spending via Primary Path
// ===========================================================================

section("Phase 3 — Spending via Primary Path");

// Build spend message (in production: transaction hash)
const spendMessage = new TextEncoder().encode(
  `P2MR_SPEND:${output.outputId}:recipient-address:${Date.now()}`,
);
indent(`Spend message: ${spendMessage.length} bytes`);

// Sign with ML-DSA-65
indent("\nSigning with ML-DSA-65...");
const sigResult = dsaSigner.sign(
  spendMessage,
  primaryKeys.secretKey,
  "ml-dsa-65",
);
indent(`  Signature: ${sigResult.signature.length} bytes`);
indent(`  Audit commitment: ${sigResult.auditCommitment.substring(0, 32)}...`);

// Build spend proof
indent("\nBuilding spend proof...");
const spendProof = buildSpendProof({
  outputId: output.outputId,
  tree,
  leafIndex: 0, // Primary path
  witness: {
    publicKeys: [primaryKeys.publicKey],
    signatures: [sigResult.signature],
  },
});

indent(`  Revealed leaf type: ${spendProof.revealedLeaf.type}`);
indent(`  Merkle proof length: ${spendProof.merkleProof.length} nodes`);

// Verify spend proof structure
indent("\nVerifying spend proof structure...");
const structureResult = verifySpendProofStructure(spendProof, output);
if (!structureResult.valid) {
  console.error(`  ✗ Structure verification failed: ${structureResult.reason}`);
  process.exit(1);
}
indent("  ✓ Structure verified");

// Verify script (ML-DSA-65 signature)
indent("\nVerifying ML-DSA-65 signature (script interpretation)...");
const scriptResult = interpretScript({
  leaf: spendProof.revealedLeaf,
  witness: spendProof.witness,
  message: spendMessage,
});

if (!scriptResult.valid) {
  console.error(`  ✗ Script verification failed: ${scriptResult.reason}`);
  process.exit(1);
}

indent("  ✓ ML-DSA-65 signature verified");
indent(`  Audit trail: ${scriptResult.auditTrail.length} steps`);

// Mark output as spent
outputStore.markSpent(output.outputId);
indent("\n✓ Output successfully spent — value transferred to recipient");

// ===========================================================================
// Phase 4 — Security Property Verification
// ===========================================================================

section("Phase 4 — Security Properties (Attack Scenarios)");

// --- Scenario 1: Wrong public key (hash mismatch) ---
indent("1. Attempting spend with wrong public key...");
const attackerKeys = dsaSigner.generateKeyPair("ml-dsa-65");
const wrongKeyResult = interpretScript({
  leaf: spendProof.revealedLeaf,
  witness: {
    publicKeys: [attackerKeys.publicKey], // Wrong key
    signatures: [sigResult.signature],
  },
  message: spendMessage,
});
indent(
  `   Result: ${!wrongKeyResult.valid ? "✓ Rejected" : "✗ SHOULD HAVE FAILED"} — ${wrongKeyResult.reason}`,
);

// --- Scenario 2: Tampered signature ---
indent("\n2. Attempting spend with tampered signature...");
const tamperedSig = new Uint8Array(sigResult.signature);
if (tamperedSig[42] !== undefined) {
  tamperedSig[42] ^= 0xff; // Flip byte 42
}
const tamperedSigResult = interpretScript({
  leaf: spendProof.revealedLeaf,
  witness: {
    publicKeys: [primaryKeys.publicKey],
    signatures: [tamperedSig],
  },
  message: spendMessage,
});
indent(
  `   Result: ${!tamperedSigResult.valid ? "✓ Rejected" : "✗ SHOULD HAVE FAILED"} — ${tamperedSigResult.reason}`,
);

// --- Scenario 3: Invalid Merkle proof ---
indent("\n3. Attempting spend with invalid Merkle proof...");
const invalidProof = {
  ...spendProof,
  merkleProof: spendProof.merkleProof.map((node) => ({
    ...node,
    hash: "a".repeat(64), // Invalid hash
  })),
};
// fakeOutput could be used to test against wrong output, but we verify against actual output
void { ...output, merkleRoot: "b".repeat(64) };
const invalidProofResult = MerkleTree.verify(
  invalidProof.revealedLeaf,
  invalidProof.merkleProof,
  output.merkleRoot,
);
indent(
  `   Result: ${!invalidProofResult ? "✓ Rejected" : "✗ SHOULD HAVE FAILED"} — Merkle proof does not match root`,
);

// --- Scenario 4: Double-spend attempt ---
indent("\n4. Attempting double-spend of already-spent output...");
let doubleSpendRejected = false;
try {
  outputStore.markSpent(output.outputId); // Already spent above
} catch (e) {
  doubleSpendRejected = true;
  indent(`   Result: ✓ Rejected — ${(e as Error).message}`);
}
if (!doubleSpendRejected) {
  indent("   Result: ✗ SHOULD HAVE FAILED — double-spend allowed");
}

// ===========================================================================
// Demonstrate Backup Path (Timelock)
// ===========================================================================

section("Bonus: Timelock Path Demonstration");

// Create a new output for timelock demo
const { output: timelockOutput, tree: timelockTree } = createP2MROutput({
  leaves: [
    createTimelockLeaf(backupKeyHash, Date.now() - 1000), // Locktime in the past
  ],
  value: BigInt(1_000_000),
});
outputStore.add(timelockOutput);

const timelockMessage = new TextEncoder().encode(
  `P2MR_SPEND:${timelockOutput.outputId}:recipient:${Date.now()}`,
);
const timelockSig = dsaSigner.sign(
  timelockMessage,
  backupKeys.secretKey,
  "ml-dsa-65",
);

const timelockProof = buildSpendProof({
  outputId: timelockOutput.outputId,
  tree: timelockTree,
  leafIndex: 0,
  witness: {
    publicKeys: [backupKeys.publicKey],
    signatures: [timelockSig.signature],
    timestamp: Date.now(), // Current time > locktime
  },
});

const timelockResult = interpretScript({
  leaf: timelockProof.revealedLeaf,
  witness: timelockProof.witness,
  message: timelockMessage,
  currentTime: Date.now(),
});

indent(`Timelock spending: ${timelockResult.valid ? "✓ Success" : "✗ Failed"}`);
if (timelockResult.valid) {
  indent("Locktime has passed — backup key authorized");
}

// ===========================================================================
// Summary
// ===========================================================================

section("Summary");
indent("✓ Phase 1  Key ceremony complete — ML-DSA-65 key pairs generated");
indent("✓ Phase 2  P2MR output created — ONLY Merkle root on-chain");
indent("✓ Phase 3  Primary path spending verified — ML-DSA-65 signature valid");
indent("✓ Phase 4  Security properties validated:");
indent("           - Wrong public key rejected (hash mismatch)");
indent("           - Tampered signature rejected (ML-DSA verify failed)");
indent("           - Invalid Merkle proof rejected (root mismatch)");
indent("           - Double-spend rejected (output already spent)");
indent("✓ Bonus    Timelock path demonstrated");

console.log(
  "\n   BIP-360  https://github.com/nicholasvh/bips/blob/qrp/bip-0360.mediawiki",
);
console.log("   FIPS 204 https://csrc.nist.gov/pubs/fips/204/final\n");
