"use client";

import { Cpu, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProverToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ProverToggle({
  checked,
  onCheckedChange,
  disabled,
}: ProverToggleProps) {
  return (
    <Card className="mb-6" data-testid="prover-toggle-card">
      <CardContent className="py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {checked ? (
            <Cpu className="w-5 h-5 text-primary" />
          ) : (
            <Zap className="w-5 h-5 text-yellow-500" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium">STARK Prover Mode</p>
              <Badge variant={checked ? "default" : "secondary"}>
                {checked ? "Real" : "Mock"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {checked
                ? "Generating cryptographic STARK proofs via Stone prover"
                : "Using simulated proofs for fast demo"}
            </p>
          </div>
        </div>
        <Switch
          data-testid="prover-toggle"
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label="Toggle real prover"
        />
      </CardContent>
    </Card>
  );
}
