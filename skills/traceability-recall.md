# Traceability & Recall

Supply chain provenance tracking and contamination response patterns.

## When to Use

- Anchoring food lot origin, producer, and harvest metadata on-chain
- Recording shipment telemetry (temperature, location, timestamps)
- Evaluating recall scope based on contamination type and breach severity
- Cross-chain anchoring (Fabric lots → Besu verification)

## When NOT to Use

- Real-time IoT streaming (use message broker, anchor summaries)
- Consumer-facing provenance queries (requires indexing layer)
- Regulatory reporting (requires additional compliance metadata)

## Key Concepts

**Lot Anchoring**: Immutable record of food lot origin. Fields: lotId, producer, product, harvestDate, stateRoot. Anchored via Fabric chaincode or Besu contract.

**Shipment Tracking**: Telemetry records attached to shipments. Each reading includes temperature (°C), location, timestamp. Breaches flagged when limits exceeded.

**Recall Assessment**: Algorithm evaluating contamination impact. Inputs: flagged lot IDs, contamination type, temperature breach thresholds. Output: impacted lots, shipments, destinations, reasons.

**Cross-Chain Oracle**: `TraceabilityAnchor.sol` accepts signed lot hashes from Fabric. `ANCHOR_ORACLE` role authorizes bridge operators. Signature verification prevents unauthorized anchoring.

## Architecture

```
Domain Layer (modules/traceability/src/domain/)
├── entities.ts  → FoodLot, Shipment, TelemetryReading, RecallDecision
├── ports.ts     → LotRepository, ShipmentRepository interfaces
└── recall.ts    → Contamination types, threshold constants

Application Layer (modules/traceability/src/application/)
└── recall-assessor.ts → RecallAssessor.assess(criteria): RecallDecision

Infrastructure Layer (modules/traceability/src/infrastructure/)
└── in-memory-store.ts → InMemoryLotRepository, InMemoryShipmentRepository

Protocol Adapters
├── modules/protocols/fabric/src/index.ts  → recordShipment, anchorLot
└── modules/protocols/besu/src/index.ts    → anchorLotHash

Smart Contracts
├── contracts/solidity/src/TraceabilityAnchor.sol
└── contracts/fabric/FoodTraceContract.ts
```

**Domain Isolation**: `RecallAssessor` depends only on repository ports. No knowledge of Fabric, Besu, or storage implementation.

**Single Responsibility**: Assessor evaluates recall criteria. Repositories handle persistence. Adapters handle protocol translation.

## Implementation

```typescript
RecallAssessor
├── constructor(lotRepo: LotRepository, shipmentRepo: ShipmentRepository)
└── assess(criteria: RecallCriteria): RecallDecision

RecallCriteria {
  flaggedLotIds?: string[]
  contaminationType?: 'biological' | 'chemical'
  temperatureBreachThreshold?: number
}

RecallDecision {
  impactedLotIds: string[]
  impactedShipmentIds: string[]
  impactedDestinations: string[]
  reasons: string[]
}

FoodTraceContract (Fabric chaincode)
├── createProduct(lotId, producer, product, harvestDate)
├── recordShipment(shipmentId, lotId, origin, destination, timestamp)
├── recordTelemetry(shipmentId, temperature, location, timestamp)
├── traceOrigin(lotId): ProvenanceChain
└── assessRecall(criteria): RecallDecision
```

## Temperature Thresholds

| Category   | Safe Range   | Breach Severity        |
| ---------- | ------------ | ---------------------- |
| Cold chain | -2°C to 5°C  | High if > 8°C for > 2h |
| Frozen     | < -18°C      | Critical if > -10°C    |
| Ambient    | 15°C to 25°C | Medium if > 30°C       |

## Anti-patterns

**Storing telemetry on public ledger**: Temperature readings are operational data. Use Fabric transient data or private data collections. Anchor only breach summaries.

**Unsigned recall notices**: Recall decisions affect supply chain operations. Sign with HSM before anchoring. Unsigned notices are disputable.

**Single-point oracle**: Cross-chain anchoring creates trust boundary. Use multi-sig oracle or threshold signature scheme. Single oracle is single point of failure.

**Querying full history per recall**: Pre-index lot-to-shipment relationships. Full scan on every recall is O(n) and blocks under load.

**Ignoring contamination type**: Biological contamination (bacteria) spreads through contact. Chemical contamination (pesticide) is isolated to source lot. Assessment algorithms differ.

## Related Skills

- [platform-selection](platform-selection.md) — Fabric vs Besu for traceability use cases
- [hsm-key-management](hsm-key-management.md) — HSM signing for recall notices
- [smart-contract-patterns](smart-contract-patterns.md) — TraceabilityAnchor.sol patterns

## References

- `modules/traceability/src/`
- `modules/traceability/src/domain/recall.ts`
- `contracts/solidity/src/TraceabilityAnchor.sol`
- `contracts/fabric/FoodTraceContract.ts`
- `examples/food-recall-response/index.ts`
- `examples/fabric-traceability-projection/index.ts`
- `tests/traceability.test.ts`
