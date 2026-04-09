export type Scenario =
  | "food-recall"
  | "aid-voucher"
  | "cross-border-fx"
  | "mpc-auction";
export type Rail = "solana" | "bitcoin" | "fiat";

export interface SettlementOptions {
  scenario: Scenario;
  rail: Rail;
  useRealProver: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "success" | "error" | "debug";
  message: string;
}

export interface SettlementResult {
  blockProof: {
    id: string;
    txCount: number;
    stateRoot: string;
    proof: string;
  };
  rails: {
    solana?: { signature: string; slot: number };
    bitcoin?: { txid: string; confirmations: number };
    fiat?: { messageId: string; date: string };
  };
  security: {
    pqVerified: boolean;
    mpcActive: boolean;
  };
}

export interface ProofReport {
  timestamp: string;
  scenario: string;
  rail: string;
  proofId: string;
  stateRoot: string;
  proofHex: string;
  txCount: number;
  proverLatencyMs: number;
  verificationResult: "VALID" | "INVALID" | "ERROR";
  proverType: "stone" | "mock";
}

export type SettlementEvent =
  | { type: "step:start"; step: number; label: string }
  | { type: "step:progress"; step: number; progress: number }
  | { type: "step:complete"; step: number }
  | { type: "log"; step: number; entry: LogEntry }
  | { type: "complete"; result: SettlementResult }
  | { type: "error"; error: string }
  | { type: "proof:report"; report: ProofReport };

export const STEP_LABELS = [
  "Business Event",
  "Base Proof",
  "Batch Proof (Stone Prover)",
  "Block Proof",
] as const;
