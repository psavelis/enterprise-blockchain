"use client";

import { CheckCircle } from "lucide-react";

export function SettlementBadge() {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4 glow-border">
        <CheckCircle className="w-10 h-10 text-green-400" />
      </div>
      <h2 className="text-2xl font-bold text-green-400">Settlement Complete</h2>
      <p className="text-muted-foreground mt-2">
        All proofs verified and settlement finalized
      </p>
    </div>
  );
}
