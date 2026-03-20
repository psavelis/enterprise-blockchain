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
  ["hsm transaction signing", "examples/hsm-transaction-signing/index.ts"],
  ["hsm key ceremony", "examples/hsm-key-ceremony/index.ts"],
  ["hsm envelope encryption", "examples/hsm-envelope-encryption/index.ts"],
  ["kyber kem key exchange", "examples/kyber-kem-key-exchange/index.ts"],
  ["hybrid kem settlement", "examples/hybrid-kem-settlement/index.ts"],
  ["quantum safe payment", "examples/quantum-safe-payment/index.ts"],
] as const;

for (const [label, path] of examples) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const result = spawnSync("npx", ["tsx", path], { stdio: "inherit" });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
