"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Scenario,
  Rail,
  LogEntry,
  SettlementResult,
  SettlementEvent,
  ProofReport,
} from "@/services/types";

type Status = "idle" | "running" | "completed" | "error";

interface SettlementState {
  scenario: Scenario | null;
  rail: Rail;
  useRealProver: boolean;
  status: Status;
  currentStep: number;
  stepProgress: Record<number, number>;
  logs: Record<number, LogEntry[]>;
  result: SettlementResult | null;
  proofReport: ProofReport | null;
  error: string | null;
  token: string | null;
}

interface SettlementActions {
  selectScenario: (s: Scenario | null) => void;
  selectRail: (r: Rail) => void;
  toggleRealProver: () => void;
  startSettlement: () => Promise<void>;
  handleEvent: (event: SettlementEvent) => void;
  reset: () => void;
}

type SettlementContextType = SettlementState & SettlementActions;

const SettlementContext = createContext<SettlementContextType | null>(null);

const initialState: SettlementState = {
  scenario: null,
  rail: "solana",
  useRealProver: false,
  status: "idle",
  currentStep: 0,
  stepProgress: { 0: 0, 1: 0, 2: 0, 3: 0 },
  logs: { 0: [], 1: [], 2: [], 3: [] },
  result: null,
  proofReport: null,
  error: null,
  token: null,
};

export function SettlementProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettlementState>(initialState);

  const selectScenario = useCallback((scenario: Scenario | null) => {
    setState((prev) => ({ ...prev, scenario }));
  }, []);

  const selectRail = useCallback((rail: Rail) => {
    setState((prev) => ({ ...prev, rail }));
  }, []);

  const toggleRealProver = useCallback(() => {
    setState((prev) => ({ ...prev, useRealProver: !prev.useRealProver }));
  }, []);

  const startSettlement = useCallback(async () => {
    if (!state.scenario) return;

    setState((prev) => ({
      ...prev,
      status: "running",
      currentStep: 0,
      stepProgress: { 0: 0, 1: 0, 2: 0, 3: 0 },
      logs: { 0: [], 1: [], 2: [], 3: [] },
      result: null,
      proofReport: null,
      error: null,
    }));

    try {
      const response = await fetch("/api/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: state.scenario,
          rail: state.rail,
          useRealProver: state.useRealProver,
        }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Failed to start settlement");
      }

      const { token } = await response.json() as { token: string };
      setState((prev) => ({ ...prev, token }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  }, [state.scenario, state.rail, state.useRealProver]);

  const handleEvent = useCallback((event: SettlementEvent) => {
    switch (event.type) {
      case "step:start":
        setState((prev) => ({
          ...prev,
          currentStep: event.step,
        }));
        break;

      case "step:progress":
        setState((prev) => ({
          ...prev,
          stepProgress: {
            ...prev.stepProgress,
            [event.step]: event.progress,
          },
        }));
        break;

      case "step:complete":
        setState((prev) => ({
          ...prev,
          stepProgress: {
            ...prev.stepProgress,
            [event.step]: 100,
          },
        }));
        break;

      case "log":
        setState((prev) => ({
          ...prev,
          logs: {
            ...prev.logs,
            [event.step]: [...(prev.logs[event.step] ?? []), event.entry],
          },
        }));
        break;

      case "complete":
        setState((prev) => ({
          ...prev,
          status: "completed",
          result: event.result,
        }));
        break;

      case "error":
        setState((prev) => ({
          ...prev,
          status: "error",
          error: event.error,
        }));
        break;

      case "proof:report":
        setState((prev) => ({
          ...prev,
          proofReport: event.report,
        }));
        break;
    }
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const value: SettlementContextType = {
    ...state,
    selectScenario,
    selectRail,
    toggleRealProver,
    startSettlement,
    handleEvent,
    reset,
  };

  return (
    <SettlementContext.Provider value={value}>
      {children}
    </SettlementContext.Provider>
  );
}

export function useSettlement() {
  const ctx = useContext(SettlementContext);
  if (!ctx) {
    throw new Error("useSettlement must be used within SettlementProvider");
  }
  return ctx;
}
