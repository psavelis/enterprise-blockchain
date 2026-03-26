# Skill: Traceability & Recall Patterns

## When to use

When a supply chain consortium needs to anchor lot provenance, track shipments with telemetry, and coordinate food recalls across organizations.

## Key concepts

- **Lot anchoring**: A food lot's origin, producer, and harvest date are anchored on-chain (Fabric or Besu) so downstream participants can verify provenance.
- **Shipment tracking**: Temperature, location, and timestamp telemetry is recorded per shipment. Telemetry that exceeds thresholds triggers recall evaluation.
- **Recall assessment**: `RecallAssessor.assess()` evaluates whether a lot should be recalled based on contamination type ('biological' vs 'chemical') and temperature breach severity.
- **Cross-chain anchoring**: `TraceabilityAnchor.sol` anchors Fabric lot hashes on Besu for cross-chain verification.

## Implementation pattern

```
Domain:
  modules/traceability/src/
    ├── domain/entities.ts      → FoodLot, Shipment, RecallDecision
    ├── application/recall-assessor.ts → assess(lotId) → RecallDecision
    └── infrastructure/in-memory-store.ts

Protocol adapters:
  modules/protocols/fabric/src/index.ts → recordShipment, anchorLot
  modules/protocols/besu/src/index.ts   → anchorLotHash (cross-chain)

Smart contracts:
  contracts/solidity/src/TraceabilityAnchor.sol
  contracts/fabric/FoodTraceContract.ts
```

## Pitfalls

- Temperature telemetry should be stored as transient data in Fabric (private data collection) — it's sensitive operational data that doesn't belong on the public ledger.
- Recall decisions should be signed (HSM) before anchoring — an unsigned recall notice can be disputed.
- Cross-chain anchoring (Fabric → Besu) introduces a trust boundary at the oracle role. The `ANCHOR_ORACLE` role in `TraceabilityAnchor.sol` must be a trusted bridge operator.

## References

- `modules/traceability/src/`
- `contracts/solidity/src/TraceabilityAnchor.sol`
- `contracts/fabric/FoodTraceContract.ts`
- `examples/food-recall-response/index.ts`
- `examples/fabric-traceability-projection/index.ts`
- `tests/traceability.test.ts`
