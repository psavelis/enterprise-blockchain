/**
 * Generate realistic mock data for the demo
 */

export function generateProofId(): string {
  return `0x${Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("")}`;
}

export function generateSolanaSignature(): string {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const sig = Array.from({ length: 88 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join("");
  return `${sig.slice(0, 20)}...${sig.slice(-8)}`;
}

export function generateBitcoinTxid(): string {
  const hex = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
  return `${hex.slice(0, 16)}...${hex.slice(-8)}`;
}

export function generateIso20022MessageId(): string {
  const date =
    new Date().toISOString().split("T")[0]?.replace(/-/g, "") || "20260408";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `QSAF-${date}-${suffix}`;
}

export function generateSlot(): number {
  return Math.floor(Math.random() * 100_000_000) + 250_000_000;
}

// Scenario-specific log messages
export const scenarioMessages = {
  "food-recall": {
    0: [
      "Initializing food recall assessment...",
      "Loading lot data for Green Valley Farms...",
      "Processing contaminated spinach lot LOT-SPINACH-001...",
      "Checking cold-chain telemetry for shipment SHIP-101...",
      "Temperature breach detected: 7.9°C (limit: 5°C)...",
      "Flagging affected distribution centers...",
      "Business event captured successfully",
    ],
    1: [
      "Generating base proof for lot state transition...",
      "Computing Merkle path for affected inventory...",
      "Hashing shipment trace data...",
      "Creating ZK witness for cold-chain breach...",
      "Base proof commitment: 0x7a2f...",
      "Base proof generated successfully",
    ],
    2: [
      "Aggregating base proofs into Tier-1 batch...",
      "Verifying state continuity chain...",
      "Computing recursive proof composition...",
      "Stone Prover: Generating STARK proof...",
      "Tier-1 aggregation: 4/4 proofs verified...",
      "Batch proof generated successfully",
    ],
    3: [
      "Finalizing Tier-2 block proof...",
      "Aggregating Tier-1 proofs (2/2)...",
      "Computing final state root...",
      "Block proof commitment: 0xf3e1...",
      "Verification: VALID",
      "Block proof finalized successfully",
    ],
  },
  "aid-voucher": {
    0: [
      "Initializing aid voucher reconciliation...",
      "Loading grant data for GRANT-9001...",
      "Processing redemption claims...",
      "Validating merchant categories...",
      "Checking for duplicate invoices...",
      "Flagging exceptions: 2 claims rejected...",
      "Business event captured successfully",
    ],
    1: [
      "Generating base proof for claim validation...",
      "Computing Merkle path for grant balances...",
      "Hashing settlement instruction...",
      "Creating ZK witness for compliance check...",
      "Base proof commitment: 0x3d8a...",
      "Base proof generated successfully",
    ],
    2: [
      "Aggregating base proofs into Tier-1 batch...",
      "Verifying settlement continuity...",
      "Computing recursive proof composition...",
      "Stone Prover: Generating STARK proof...",
      "Tier-1 aggregation: 4/4 proofs verified...",
      "Batch proof generated successfully",
    ],
    3: [
      "Finalizing Tier-2 block proof...",
      "Aggregating Tier-1 proofs (2/2)...",
      "Computing final reconciliation root...",
      "Block proof commitment: 0xa7c2...",
      "Verification: VALID",
      "Block proof finalized successfully",
    ],
  },
  "cross-border-fx": {
    0: [
      "Initializing cross-border FX settlement...",
      "Loading instruction MGB-NPY-2026-FX-001...",
      "Currency pair: EUR/JPY @ 162.34...",
      "Notional: €50,000,000 → ¥8,117,000,000...",
      "Correspondent chain: MRGBDEFF → DEUTDEDB → BOTKJPJT → NOVAJPJT...",
      "ML-DSA-65 signature verified (FIPS 204)...",
      "Business event captured successfully",
    ],
    1: [
      "Generating base proof for FX instruction...",
      "Hybrid KEM encapsulation: X25519 + ML-KEM-768...",
      "AES-256-GCM encrypting settlement bundle...",
      "Creating ZK witness for rate attestation...",
      "Base proof commitment: 0x9c4e...",
      "Base proof generated successfully",
    ],
    2: [
      "Aggregating FX proofs into Tier-1 batch...",
      "Verifying correspondent chain integrity...",
      "Computing recursive proof composition...",
      "Stone Prover: Generating STARK proof...",
      "Tier-1 aggregation: 4/4 proofs verified...",
      "Batch proof generated successfully",
    ],
    3: [
      "Finalizing Tier-2 block proof...",
      "3-of-3 MPC authorization: Officer A ✓...",
      "3-of-3 MPC authorization: Officer B ✓...",
      "3-of-3 MPC authorization: Officer C ✓...",
      "ISO 20022 pain.001 message generated...",
      "Block proof finalized successfully",
    ],
  },
  "mpc-auction": {
    0: [
      "Initializing MPC sealed-bid auction...",
      "Registering bidders: Nordic Steel, Baltic Alloys, Rhine Components...",
      "Procurement: Industrial Steel Alloy Grade 316L...",
      "Quantity: 500 metric tons...",
      "Deadline: T+24h settlement...",
      "Bid commitments received (SHA-256)...",
      "Business event captured successfully",
    ],
    1: [
      "Generating base proofs for bid commitments...",
      "Nordic Steel: bid secret-shared (3-of-3)...",
      "Baltic Alloys: bid secret-shared (3-of-3)...",
      "Rhine Components: bid secret-shared (3-of-3)...",
      "Additive MPC shares distributed...",
      "Base proof generated successfully",
    ],
    2: [
      "Aggregating MPC computation proofs...",
      "Threshold reveal: share 1/3 reconstructed...",
      "Threshold reveal: share 2/3 reconstructed...",
      "Threshold reveal: share 3/3 reconstructed...",
      "Stone Prover: Generating STARK proof...",
      "Batch proof generated successfully",
    ],
    3: [
      "Finalizing auction settlement proof...",
      "Winner determination: lowest bid wins...",
      "Baltic Alloys: €389,000 — WINNER...",
      "Generating Solana Memo with proof commitment...",
      "Settlement transaction signed (ML-DSA-65)...",
      "Block proof finalized successfully",
    ],
  },
} as const;
