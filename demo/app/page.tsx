"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/layout/container";
import { ScenarioCard } from "@/components/dashboard/scenario-card";
import { StartSettlement } from "@/components/dashboard/start-settlement";
import { useSettlement } from "@/context/settlement-context";
import type { Scenario } from "@/services/types";

export default function DashboardPage() {
  const router = useRouter();
  const {
    scenario,
    rail,
    useRealProver,
    selectScenario,
    selectRail,
    toggleRealProver,
    startSettlement,
  } = useSettlement();
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    if (!scenario) return;
    setLoading(true);
    try {
      await startSettlement();
      // startSettlement sets state.status to 'error' on failure
      // Navigation happens regardless - progress page handles errors
      router.push("/progress");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column - Scenario Selection */}
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold mb-2">Select Scenario</h2>
            <p className="text-muted-foreground">
              Choose a business scenario to demonstrate STARK settlement
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ScenarioCard
              scenario="food-recall"
              selected={scenario === "food-recall"}
              onSelect={() =>
                selectScenario(
                  scenario === "food-recall"
                    ? null
                    : ("food-recall" as Scenario),
                )
              }
            />
            <ScenarioCard
              scenario="aid-voucher"
              selected={scenario === "aid-voucher"}
              onSelect={() =>
                selectScenario(
                  scenario === "aid-voucher"
                    ? null
                    : ("aid-voucher" as Scenario),
                )
              }
            />
            <ScenarioCard
              scenario="cross-border-fx"
              selected={scenario === "cross-border-fx"}
              onSelect={() =>
                selectScenario(
                  scenario === "cross-border-fx"
                    ? null
                    : ("cross-border-fx" as Scenario),
                )
              }
            />
            <ScenarioCard
              scenario="mpc-auction"
              selected={scenario === "mpc-auction"}
              onSelect={() =>
                selectScenario(
                  scenario === "mpc-auction"
                    ? null
                    : ("mpc-auction" as Scenario),
                )
              }
            />
          </div>
        </div>

        {/* Right Column - Start Settlement */}
        <div>
          <StartSettlement
            scenario={scenario}
            rail={rail}
            onRailChange={selectRail}
            useRealProver={useRealProver}
            onProverChange={() => toggleRealProver()}
            onStart={handleStart}
            loading={loading}
          />
        </div>
      </div>
    </Container>
  );
}
