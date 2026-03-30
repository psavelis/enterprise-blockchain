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
├── entities.ts      → PurchaseOrder, SharedOrderView, SignedAuditProof
└── ports.ts         → OrderRepository interface

Application Layer (modules/privacy/src/application/)
└── view-projector.ts → ViewProjector (depends on port, optional HsmClient)

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

SharedOrderView {
  orderId: string
  audience: Audience
  data: Record<string, string | number>
  auditProof: string | SignedAuditProof
}
```

**Without HSM**: `auditProof = sha256hex(JSON.stringify(order))`

**With HSM**: `auditProof = { hash, signature, signerKeyLabel, timestamp }`

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

## Related Skills

- [hsm-key-management](hsm-key-management.md) — HSM configuration for `SignedAuditProof`
- [integration-adapters](integration-adapters.md) — Protocol serialization for on-chain storage

## References

- `modules/privacy/src/domain/entities.ts`
- `modules/privacy/src/application/view-projector.ts`
- `examples/consortium-order-sharing/index.ts`
- `tests/privacy.test.ts`
