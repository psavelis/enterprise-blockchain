import type {
  SettlementOptions,
  SettlementEvent,
  SettlementResult,
  LogEntry,
  ProofReport,
} from "./types";
import {
  generateProofId,
  generateSolanaSignature,
  generateBitcoinTxid,
  generateIso20022MessageId,
  generateSlot,
  scenarioMessages,
} from "./mock-data";
import { STEP_LABELS } from "./types";

const STEP_DURATIONS = [1500, 2000, 3000, 2000]; // Base durations in ms

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLogEntry(level: LogEntry["level"], message: string): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
}

/**
 * Async generator that yields settlement events
 * Used by the SSE endpoint to stream progress
 */
export async function* runSettlementGenerator(
  options: SettlementOptions,
): AsyncGenerator<SettlementEvent> {
  const { scenario, rail, useRealProver } = options;
  const multiplier = useRealProver ? 2 : 1;
  const messages = scenarioMessages[scenario];

  for (let step = 0; step < STEP_LABELS.length; step++) {
    const label = STEP_LABELS[step];
    const stepMessages = messages[step as keyof typeof messages];
    const baseDuration = STEP_DURATIONS[step] ?? 2000;
    const duration = baseDuration * multiplier;

    // Step start
    yield { type: "step:start", step, label: label ?? "Processing" };

    // Simulate progress with log messages
    const messageCount = stepMessages.length;
    const progressPerMessage = 100 / messageCount;

    for (let i = 0; i < messageCount; i++) {
      const message = stepMessages[i];
      const isLast = i === messageCount - 1;
      const level: LogEntry["level"] = isLast
        ? "success"
        : i === 0
          ? "info"
          : "debug";

      yield {
        type: "log",
        step,
        entry: createLogEntry(level, message ?? "Processing..."),
      };

      const progress = Math.min(Math.round((i + 1) * progressPerMessage), 100);
      yield { type: "step:progress", step, progress };

      await delay(duration / messageCount);
    }

    // Step complete
    yield { type: "step:complete", step };
  }

  // Generate final result
  const result: SettlementResult = {
    blockProof: {
      id: generateProofId(),
      txCount: 8,
      stateRoot: generateProofId(),
      proof: generateProofId(),
    },
    rails: {},
    security: {
      pqVerified: true,
      mpcActive: true,
    },
  };

  // Add rail-specific result
  switch (rail) {
    case "solana":
      result.rails.solana = {
        signature: generateSolanaSignature(),
        slot: generateSlot(),
      };
      break;
    case "bitcoin":
      result.rails.bitcoin = {
        txid: generateBitcoinTxid(),
        confirmations: 3,
      };
      break;
    case "fiat":
      result.rails.fiat = {
        messageId: generateIso20022MessageId(),
        date: new Date().toISOString().split("T")[0] ?? "2026-04-08",
      };
      break;
  }

  yield { type: "complete", result };

  // Emit proof report as final event (mock prover always succeeds)
  const proofReport: ProofReport = {
    timestamp: new Date().toISOString(),
    scenario,
    rail,
    proofId: result.blockProof.id,
    stateRoot: result.blockProof.stateRoot,
    proofHex: result.blockProof.proof,
    txCount: result.blockProof.txCount,
    proverType: "mock",
    proverLatencyMs: Math.round(
      STEP_DURATIONS.reduce((a, b) => a + b, 0) * (useRealProver ? 2 : 1),
    ),
    verificationResult: "VALID",
  };
  yield { type: "proof:report", report: proofReport };
}
