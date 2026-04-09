"use client";

import { ArrowRight, Cpu, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RailSelector } from "./rail-selector";
import type { Rail, Scenario } from "@/services/types";

interface StartSettlementProps {
  scenario: Scenario | null;
  rail: Rail;
  onRailChange: (rail: Rail) => void;
  useRealProver: boolean;
  onProverChange: (useReal: boolean) => void;
  onStart: () => void;
  loading?: boolean;
}

export function StartSettlement({
  scenario,
  rail,
  onRailChange,
  useRealProver,
  onProverChange,
  onStart,
  loading,
}: StartSettlementProps) {
  return (
    <Card className="h-fit sticky top-24">
      <CardHeader>
        <CardTitle>Start Settlement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <RailSelector value={rail} onValueChange={onRailChange} />

        {/* Prover Mode Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium">STARK Prover</label>
          <div
            className="flex items-center justify-between p-3 rounded-md border bg-secondary/30"
            data-testid="prover-selector"
          >
            <div className="flex items-center gap-2">
              {useRealProver ? (
                <Cpu className="w-4 h-4 text-primary" />
              ) : (
                <Zap className="w-4 h-4 text-yellow-500" />
              )}
              <span className="text-sm">
                {useRealProver ? "Real Stone Prover" : "Mock Prover"}
              </span>
              <Badge
                variant={useRealProver ? "default" : "secondary"}
                className="text-xs"
              >
                {useRealProver ? "ZKP" : "Demo"}
              </Badge>
            </div>
            <Switch
              data-testid="dashboard-prover-toggle"
              checked={useRealProver}
              onCheckedChange={onProverChange}
              aria-label="Toggle real prover"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {useRealProver
              ? "Generate cryptographic STARK proofs (requires Stone prover)"
              : "Use simulated proofs for faster demo experience"}
          </p>
        </div>

        <Button
          onClick={onStart}
          disabled={!scenario || loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <span className="animate-spin">⟳</span>
              Starting...
            </>
          ) : (
            <>
              Start Settlement
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
        {!scenario && (
          <p className="text-xs text-muted-foreground text-center">
            Select a scenario to continue
          </p>
        )}
      </CardContent>
    </Card>
  );
}
