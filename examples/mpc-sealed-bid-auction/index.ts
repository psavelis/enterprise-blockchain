import { MPCEngine } from "../../modules/mpc/src/index";

const engine = new MPCEngine();

engine.registerParty({
  id: "supplier-a",
  name: "Nordic Steel",
  endpoint: "node-a.example.com",
});
engine.registerParty({
  id: "supplier-b",
  name: "Baltic Alloys",
  endpoint: "node-b.example.com",
});
engine.registerParty({
  id: "supplier-c",
  name: "Rhine Components",
  endpoint: "node-c.example.com",
});

const partyIds = ["supplier-a", "supplier-b", "supplier-c"];

// Each supplier has a secret bid (never revealed to others).
const bids: Record<string, number> = {
  "supplier-a": 425_000,
  "supplier-b": 389_000,
  "supplier-c": 412_000,
};

// --- Round 1: each supplier splits its bid into shares and submits ---
for (const [bidderId, amount] of Object.entries(bids)) {
  const shares = engine.splitSecret(amount, partyIds);

  // Each party submits the share it received for this bidder's computation.
  for (const share of shares) {
    engine.submitShare(`bid-${bidderId}`, share);
  }
}

// --- Round 2: reconstruct each bid total from its additive shares ---
const results = partyIds.map((bidderId) => {
  const result = engine.compute(`bid-${bidderId}`, "sum");
  const valid = engine.verifyIntegrity(`bid-${bidderId}`);
  return {
    bidderId,
    reconstructedBid: result.result,
    integrityOk: valid,
    proof: result.integrityProof,
  };
});

// --- Compare reconstructed totals to determine winner ---
let winner = results[0]!;
for (const r of results) {
  if (r.reconstructedBid < winner.reconstructedBid) {
    winner = r;
  }
}

console.log("MPC Sealed-Bid Auction");

console.log("\nReconstructed bids from exchanged shares:");
console.log(JSON.stringify(results, null, 2));

console.log("\nWinner:");
console.log(
  JSON.stringify(
    { winner: winner.bidderId, amount: winner.reconstructedBid },
    null,
    2,
  ),
);
