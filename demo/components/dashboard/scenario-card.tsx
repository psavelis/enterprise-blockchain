"use client";

import { Shield, ShoppingCart, Globe, Gavel } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/services/types";

interface ScenarioCardProps {
  scenario: Scenario;
  selected: boolean;
  onSelect: () => void;
}

const scenarioConfig = {
  "food-recall": {
    title: "Food Recall Settlement",
    description:
      "Track contaminated food lots through the supply chain with cryptographic proofs of cold-chain compliance and recall execution.",
    Icon: Shield,
  },
  "aid-voucher": {
    title: "Aid Voucher Reconciliation",
    description:
      "Reconcile international aid vouchers with verified merchant claims and compliant settlement across multiple rails.",
    Icon: ShoppingCart,
  },
  "cross-border-fx": {
    title: "Cross-Border FX Settlement",
    description:
      "€50M EUR/JPY settlement through correspondent banks with ML-DSA-65 signatures, Hybrid KEM encryption, and 3-of-3 MPC authorization.",
    Icon: Globe,
  },
  "mpc-auction": {
    title: "MPC Sealed-Bid Auction",
    description:
      "Enterprise procurement with secret-shared supplier bids, threshold reveal, and winner determination via additive MPC.",
    Icon: Gavel,
  },
};

export function ScenarioCard({ scenario, selected, onSelect }: ScenarioCardProps) {
  const config = scenarioConfig[scenario];
  const { Icon } = config;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "cursor-pointer transition-all duration-200 hover:border-primary/50",
        selected && "glow-border-active border-primary"
      )}
    >
      <CardHeader className="space-y-4">
        <div
          className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center transition-colors",
            selected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <CardTitle className="text-xl">{config.title}</CardTitle>
          <CardDescription className="mt-2">{config.description}</CardDescription>
        </div>
      </CardHeader>
    </Card>
  );
}
