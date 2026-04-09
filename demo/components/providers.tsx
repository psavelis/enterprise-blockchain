"use client";

import type { ReactNode } from "react";
import { SettlementProvider } from "@/context/settlement-context";

export function Providers({ children }: { children: ReactNode }) {
  return <SettlementProvider>{children}</SettlementProvider>;
}
