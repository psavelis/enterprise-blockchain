import { z } from "zod";

export const settlementRequestSchema = z.object({
  scenario: z.enum([
    "food-recall",
    "aid-voucher",
    "cross-border-fx",
    "mpc-auction",
  ]),
  rail: z.enum(["solana", "bitcoin", "fiat"]),
  useRealProver: z.boolean().default(false),
});

export type SettlementRequest = z.infer<typeof settlementRequestSchema>;

export const scenarioLabels: Record<SettlementRequest["scenario"], string> = {
  "food-recall": "Food Recall Settlement",
  "aid-voucher": "Aid Voucher Reconciliation",
  "cross-border-fx": "Cross-Border FX Settlement",
  "mpc-auction": "MPC Sealed-Bid Auction",
};

export const railLabels: Record<SettlementRequest["rail"], string> = {
  solana: "Solana",
  bitcoin: "Bitcoin",
  fiat: "Fiat (ISO 20022)",
};
