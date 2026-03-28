# Skill: Selective Disclosure & Privacy Patterns

## When to use

When a consortium needs to share order data with multiple audiences (logistics, banks, regulators, suppliers) while hiding fields that each audience shouldn't see.

## Key concepts

- **Audience**: A role that receives a projected view of the original data (e.g., `logistics`, `bank`, `regulator`, `supplier`).
- **Field projection**: A function that maps a full `PurchaseOrder` to a role-specific `Record<string, string | number>`, hiding sensitive fields.
- **Audit proof**: A SHA-256 hash (or HSM-signed commitment) that ties the projected view back to the canonical order. Proves consistency without revealing hidden fields.
- **SignedAuditProof**: When an HSM is available, the proof includes `{ hash, signature, signerKeyLabel, timestamp }` — making it non-repudiable (tied to a specific issuer and time).

## Implementation pattern

```
PurchaseOrder → ViewProjector.createView(orderId, audience) → SharedOrderView
                ├── data: projected fields for audience
                └── auditProof: string | SignedAuditProof
```

- `ViewProjector` accepts optional `HsmClient` and `signerKeyLabel` in constructor.
- Without HSM: `auditProof = sha256hex(JSON.stringify(order))` — plain hash.
- With HSM: `auditProof = { hash: sha256hex(order+audience+timestamp), signature, signerKeyLabel, timestamp }`.
- `SelectiveDisclosureLedger` is a convenience facade over `InMemoryOrderRepository` + `ViewProjector`.

## Pitfalls

- Don't assume the hash alone proves who created the view — without HSM signing, anyone with the order can recompute the same hash.
- Protocol adapters must serialize `SignedAuditProof` to a string before passing to on-chain methods (the contract ABI expects `string`).
- The `SharedOrderView.auditProof` is a union type — always check `typeof auditProof === "string"` before accessing properties.

## References

- `modules/privacy/src/application/view-projector.ts`
- `modules/privacy/src/domain/entities.ts`
- `examples/consortium-order-sharing/index.ts`
- `tests/privacy.test.ts`
