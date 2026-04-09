"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Container } from "@/components/layout/container";
import { ProverToggle } from "@/components/progress/prover-toggle";
import { StepFlow } from "@/components/progress/step-flow";
import { LogPanel } from "@/components/progress/log-panel";
import { useSettlement } from "@/context/settlement-context";
import { useLiveLogs } from "@/hooks/use-live-logs";
import { STEP_LABELS } from "@/services/types";
import type { SettlementEvent } from "@/services/types";

export default function ProgressPage() {
  const router = useRouter();
  const {
    token,
    status,
    currentStep,
    stepProgress,
    logs,
    useRealProver,
    toggleRealProver,
    handleEvent,
    reset,
  } = useSettlement();

  // Navigate to results when complete
  useEffect(() => {
    if (status === "completed") {
      router.push("/results");
    }
  }, [status, router]);

  // Navigate back to dashboard if no token
  useEffect(() => {
    if (!token && status === "idle") {
      router.push("/");
    }
  }, [token, status, router]);

  const onEvent = useCallback(
    (event: SettlementEvent) => {
      handleEvent(event);
    },
    [handleEvent],
  );

  const onError = useCallback(
    (error: string) => {
      console.error("SSE Error:", error);
      handleEvent({ type: "error", error });
    },
    [handleEvent],
  );

  useLiveLogs(token, onEvent, onError);

  if (status === "error") {
    return (
      <Container>
        <div className="text-center py-16">
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error</h2>
          <p className="text-muted-foreground mb-6">
            Something went wrong during settlement
          </p>
          <button
            onClick={() => {
              reset();
              router.push("/");
            }}
            className="text-primary underline"
          >
            Return to Dashboard
          </button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <ProverToggle
        checked={useRealProver}
        onCheckedChange={toggleRealProver}
        disabled={status === "running"}
      />

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column - Step Flow */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Settlement Progress</h2>
          <StepFlow currentStep={currentStep} stepProgress={stepProgress} />
        </div>

        {/* Right Column - Log Panels */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold mb-4">Live Logs</h2>
          {STEP_LABELS.map((label, index) => (
            <LogPanel
              key={index}
              title={label}
              logs={logs[index] ?? []}
              isActive={currentStep === index && status === "running"}
            />
          ))}
        </div>
      </div>
    </Container>
  );
}
