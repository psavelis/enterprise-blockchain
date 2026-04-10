export interface PurchaseOrder {
  readonly id: string;
  readonly buyer: string;
  readonly supplier: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPriceUsd: number;
  readonly incoterm: string;
  readonly destinationPort: string;
  readonly financingBank?: string;
  readonly sustainabilityGrade: "A" | "B" | "C";
}

export type Audience = "logistics" | "bank" | "regulator" | "supplier";

export interface SignedAuditProof {
  readonly hash: string;
  readonly signature: string;
  readonly signerKeyLabel: string;
  readonly timestamp: string;
}

export interface SharedOrderView {
  readonly orderId: string;
  readonly audience: Audience;
  readonly data: Record<string, string | number>;
  readonly auditProof: string | SignedAuditProof;
}
