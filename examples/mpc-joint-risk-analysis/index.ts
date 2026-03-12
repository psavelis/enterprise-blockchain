import { MPCEngine } from "../../modules/mpc/src/index";

const engine = new MPCEngine();

engine.registerParty({ id: "bank-meridian", name: "Meridian Commercial Bank", endpoint: "meridian.example.com" });
engine.registerParty({ id: "bank-hansa", name: "Hansa Trade Bank", endpoint: "hansa.example.com" });

const partyIds = ["bank-meridian", "bank-hansa"];

// Private risk metrics per bank (not revealed to the counterpart).
const portfolioRisks: Record<string, { defaultRate: number; exposureUsd: number; avgCreditScore: number }> = {
  "bank-meridian": { defaultRate: 312, exposureUsd: 84_000_000, avgCreditScore: 710 },
  "bank-hansa":    { defaultRate: 287, exposureUsd: 61_000_000, avgCreditScore: 725 },
};

// --- Submit secret-shared metrics for joint computation ---
for (const [bankId, metrics] of Object.entries(portfolioRisks)) {
  const defaultShares  = engine.splitSecret(metrics.defaultRate, partyIds);
  const exposureShares = engine.splitSecret(metrics.exposureUsd, partyIds);
  const creditShares   = engine.splitSecret(metrics.avgCreditScore, partyIds);

  for (const s of defaultShares)  engine.submitShare(`default-${bankId}`, s);
  for (const s of exposureShares) engine.submitShare(`exposure-${bankId}`, s);
  for (const s of creditShares)   engine.submitShare(`credit-${bankId}`, s);
}

// --- Aggregate risk indicators across both banks ---
const aggregateDefault = partyIds.reduce((sum, id) => {
  return sum + engine.compute(`default-${id}`, "sum").result;
}, 0);

const aggregateExposure = partyIds.reduce((sum, id) => {
  return sum + engine.compute(`exposure-${id}`, "sum").result;
}, 0);

const aggregateCredit = partyIds.reduce((sum, id) => {
  return sum + engine.compute(`credit-${id}`, "sum").result;
}, 0);

// --- Threshold check: single-bank exposure exceeds regulatory limit? ---
const exposureThreshold = engine.compute(`exposure-bank-meridian`, "threshold", {
  threshold: 100_000_000,
});

console.log("MPC Joint Risk Analysis");

console.log("\nAggregate metrics (individual portfolios not exposed):");
console.log(JSON.stringify({
  totalDefaultsBasisPoints: aggregateDefault,
  totalExposureUsd: aggregateExposure,
  combinedAvgCreditScore: aggregateCredit,
  averageCreditScore: Math.round(aggregateCredit / partyIds.length),
}, null, 2));

console.log("\nRegulatory threshold check (single-bank exposure >= $100M):");
console.log(JSON.stringify({
  threshold: exposureThreshold.meta.threshold,
  exceeded: exposureThreshold.meta.exceeded,
  integrityProof: exposureThreshold.integrityProof,
}, null, 2));
