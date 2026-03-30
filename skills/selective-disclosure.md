# Selective Disclosure

Audience-based field projection with cryptographic audit proofs.

## When to Use

- Sharing order data with multiple parties (logistics, banks, regulators, suppliers)
- Hiding sensitive fields per audience while proving data consistency
- Generating non-repudiable audit trails with HSM-signed commitments

## When NOT to Use

- Full data replication across all parties
- Encryption-based access control (use envelope encryption instead)
- Zero-knowledge proofs (this pattern uses hash commitments, not ZKPs)

## Key Concepts

**Audience**: Role-based data consumer (e.g., `logistics`, `bank`, `regulator`, `supplier`). Each audience receives a projected view with different visible fields.

**Field Projection**: Pure function mapping full entity to audience-specific subset. No side effects. Deterministic output for identical inputs.

**Audit Proof**: SHA-256 hash binding projected view to canonical source. Proves consistency without revealing hidden fields.

**SignedAuditProof**: HSM-signed commitment including `{ hash, signature, signerKeyLabel, timestamp }`. Provides non-repudiation and temporal binding.

## Architecture

```
Domain Layer (modules/privacy/src/domain/)
├── entities.ts      → PurchaseOrder, SharedOrderView, SignedAuditProof, Audience
└── ports.ts         → OrderRepository interface

Application Layer (modules/privacy/src/application/)
└── view-projector.ts → ViewProjector

Infrastructure Layer (modules/privacy/src/infrastructure/)
└── in-memory-store.ts → InMemoryOrderRepository implements OrderRepository
```

**Dependency Inversion**: `ViewProjector` depends on `OrderRepository` port, not concrete store. HSM integration is optional constructor parameter.

**Single Responsibility**: `ViewProjector` handles projection logic only. Storage, signing, and protocol serialization are separate concerns.

## Implementation

```typescript
ViewProjector
├── constructor(
│     repo: OrderRepository,
│     logger?: Logger,
│     hsm?: HsmClient,
│     signerKeyLabel?: string,
│   )
└── createView(orderId: string, audience: Audience): SharedOrderView

Audience = 'logistics' | 'bank' | 'regulator' | 'supplier'

PurchaseOrder {
  orderId: string
  buyerId: string
  sellerId: string
  product: string
  quantity: number
  unitPrice: number
  totalValue: number
  currency: string
  shipmentAddress: string
  paymentTerms: string
  regulatoryCode: string
}

SharedOrderView {
  orderId: string
  audience: Audience
  data: Record<string, string | number>
  auditProof: string | SignedAuditProof
}

SignedAuditProof {
  hash: string
  signature: string
  signerKeyLabel: string
  timestamp: number
}
```

## Field Visibility Matrix

| Field           | logistics | bank | regulator | supplier |
| --------------- | --------- | ---- | --------- | -------- |
| orderId         | ✓         | ✓    | ✓         | ✓        |
| product         | ✓         |      | ✓         | ✓        |
| quantity        | ✓         |      | ✓         | ✓        |
| shipmentAddress | ✓         |      |           |          |
| totalValue      |           | ✓    | ✓         |          |
| currency        |           | ✓    | ✓         |          |
| paymentTerms    |           | ✓    |           |          |
| regulatoryCode  |           |      | ✓         |          |
| buyerId         |           |      | ✓         |          |
| sellerId        |           |      | ✓         | ✓        |

## Must-Preserve Invariants

1. **Projection determinism**: Same `(orderId, audience)` always produces identical `data` fields
2. **Audit proof binding**: `auditProof` hash covers full source order, not just projected fields
3. **HSM signature presence**: If `hsm` and `signerKeyLabel` provided, `auditProof` is `SignedAuditProof`
4. **Type union handling**: Always type-guard before accessing `SignedAuditProof` properties
5. **Repository dependency**: `ViewProjector` never accesses storage directly; uses `OrderRepository.findById()`

## Anti-patterns

**Assuming hash proves authorship**: Without HSM signing, any party with source data can compute identical hash. Hash alone proves consistency, not origin.

**Mixing projection with serialization**: Protocol adapters serialize `SignedAuditProof` to string for on-chain storage. Keep serialization in adapter layer, not domain.

**Type confusion on auditProof**: `SharedOrderView.auditProof` is union type. Always type-guard before accessing properties:

```typescript
if (typeof view.auditProof !== "string") {
  console.log(view.auditProof.signature);
}
```

**Projecting at query time**: Compute projections at write time when possible. Query-time projection increases latency and complicates caching.

**Hardcoding audience rules**: Field visibility rules should be configurable, not embedded in `ViewProjector`. Current implementation uses fixed rules for demo.

**Ignoring missing orders**: `createView()` throws if order not found. Always handle `OrderNotFoundError`.

## Related Skills

- [hsm-key-management](hsm-key-management.md) — HSM configuration for `SignedAuditProof`
- [integration-adapters](integration-adapters.md) — Protocol serialization for on-chain storage

## References

- `modules/privacy/src/domain/entities.ts`
- `modules/privacy/src/domain/ports.ts`
- `modules/privacy/src/application/view-projector.ts`
- `modules/privacy/src/infrastructure/in-memory-store.ts`
- `examples/consortium-order-sharing/index.ts`
- `examples/selective-attribute-disclosure/index.ts`
- `tests/privacy.test.ts`
