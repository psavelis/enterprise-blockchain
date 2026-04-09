"use client";

import { Select } from "@/components/ui/select";
import type { Rail } from "@/services/types";

interface RailSelectorProps {
  value: Rail;
  onValueChange: (value: Rail) => void;
}

export function RailSelector({ value, onValueChange }: RailSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        Select Rail System
      </label>
      <Select value={value} onValueChange={(v) => onValueChange(v as Rail)}>
        <option value="solana">Solana (VersionedTransaction)</option>
        <option value="bitcoin">Bitcoin (PSBT)</option>
        <option value="fiat">Fiat (ISO 20022 pain.001)</option>
      </Select>
    </div>
  );
}
