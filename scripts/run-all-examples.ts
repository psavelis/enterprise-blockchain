import { spawnSync } from "node:child_process";

const examples = [
  ["food recall", "examples/food-recall-response/index.ts"],
  ["order sharing", "examples/consortium-order-sharing/index.ts"],
  ["staffing clearance", "examples/hospital-staffing-clearance/index.ts"],
  ["aid reconciliation", "examples/aid-voucher-reconciliation/index.ts"],
  ["mpc sealed-bid auction", "examples/mpc-sealed-bid-auction/index.ts"],
  ["mpc joint risk analysis", "examples/mpc-joint-risk-analysis/index.ts"],
  [
    "quantum-resistant key sharing",
    "examples/quantum-resistant-key-sharing/index.ts",
  ],
] as const;

for (const [label, path] of examples) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const result = spawnSync("npx", ["tsx", path], { stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
