import { QuantumResistantVault } from "../../modules/mpc/src/quantum";

const vault = new QuantumResistantVault();

const signingKeyValue = 9_876_543;
const parties = ["node-eu-west", "node-us-east", "node-ap-south", "node-af-north", "node-sa-east"];
const threshold = 3;

console.log("Quantum-Resistant Key Sharing");
console.log(`\nDistributing signing key across ${parties.length} nodes (${threshold}-of-${parties.length} threshold)`);

const shares = vault.distributeSecret(signingKeyValue, parties, threshold);

console.log("\nShares distributed:");
for (const [partyId, share] of shares.entries()) {
  console.log(`  ${partyId}: share #${share.shareIndex}, commitment ${share.commitment.slice(0, 16)}…`);
}

// Below threshold: 2 shares reveal nothing.
const twoShares = [...shares.values()].slice(0, 2);
const belowThreshold = vault.reconstructSecret(twoShares, threshold);

console.log(`\n2-of-${parties.length} reconstruction: ${belowThreshold === null ? "denied (below threshold)" : belowThreshold}`);

// At threshold: any 3 shares reconstruct the key.
const firstThree = [...shares.values()].slice(0, 3);
const fromFirstThree = vault.reconstructSecret(firstThree, threshold);

console.log(`\n3-of-${parties.length} reconstruction (shares 0–2): ${fromFirstThree}`);
console.log(`  matches original: ${fromFirstThree === signingKeyValue}`);

// Different 3 shares also work — not position-dependent.
const lastThree = [...shares.values()].slice(2, 5);
const fromLastThree = vault.reconstructSecret(lastThree, threshold);

console.log(`\n3-of-${parties.length} reconstruction (shares 2–4): ${fromLastThree}`);
console.log(`  matches original: ${fromLastThree === signingKeyValue}`);

// Anchor a supply-chain certificate with a hash-ladder proof.
const certificate = JSON.stringify({
  type: "supply-chain-certificate",
  lot: "LOT-2026-03-001",
  origin: "Brazil",
  certifiedBy: "ISCC",
});

const anchor = vault.anchorWithPostQuantumProof(certificate);

console.log("\nHash-ladder anchor:");
console.log(JSON.stringify(anchor, null, 2));
