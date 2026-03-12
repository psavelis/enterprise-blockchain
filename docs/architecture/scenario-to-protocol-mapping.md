# Scenario to Protocol Mapping

This page shows how the repository scenarios translate from domain logic to protocol-specific transaction patterns.

## Food Recall Response

- Scenario: [examples/food-recall-response/index.ts](examples/food-recall-response/index.ts)
- Domain logic: [modules/traceability/src/index.ts](modules/traceability/src/index.ts)
- Protocol adapter: [modules/protocols/fabric/src/index.ts](modules/protocols/fabric/src/index.ts)

Typical mapping:

1. A supplier lot becomes a Fabric `CreateProduct` chaincode invocation.
2. A shipment update becomes a `RecordShipment` transaction with telemetry passed through transient data when needed.
3. Endorsement hints represent the operational rule that retailer and supplier, or carrier and retailer, must co-sign critical changes.

Why it fits:

- The scenario needs deterministic finality, organizational endorsement, and selectively shared operational details.

## Consortium Order Sharing

- Scenario: [examples/consortium-order-sharing/index.ts](examples/consortium-order-sharing/index.ts)
- Domain logic: [modules/privacy/src/index.ts](modules/privacy/src/index.ts)
- Protocol adapter: [modules/protocols/besu/src/index.ts](modules/protocols/besu/src/index.ts)

Typical mapping:

1. The canonical purchase order is hashed and anchored through an `anchorOrder` contract call.
2. Audience-specific projections become `publishAudienceView` calls in dedicated privacy groups.
3. The audit proof lets participants verify that each partial view derives from the same canonical order.

Why it fits:

- The scenario benefits from Ethereum-compatible contracts plus privacy-group scoped sharing for buyers, banks, suppliers, and regulators.

## Hospital Staffing Clearance

- Scenario: [examples/hospital-staffing-clearance/index.ts](examples/hospital-staffing-clearance/index.ts)
- Domain logic: [modules/credentialing/src/index.ts](modules/credentialing/src/index.ts)
- Protocol adapter: [modules/protocols/corda/src/index.ts](modules/protocols/corda/src/index.ts)

Typical mapping:

1. The staffing request and clearance decision become a `ProviderClearanceState`.
2. The adapter emits an `IssueProviderClearanceFlow` command that names the hospital, provider, and regulator-style observer as participants.
3. Approval or rejection is explicit in the Corda command rather than inferred from a general-purpose transaction log.

Why it fits:

- The scenario is governed by need-to-know disclosure rather than broad replication, which aligns well with Corda’s distribution model.

## Aid Voucher Reconciliation

- Scenario: [examples/aid-voucher-reconciliation/index.ts](examples/aid-voucher-reconciliation/index.ts)
- Domain logic: [modules/aid-settlement/src/index.ts](modules/aid-settlement/src/index.ts)
- Recommended protocol patterns: [modules/protocols/fabric/src/index.ts](modules/protocols/fabric/src/index.ts) and [modules/protocols/besu/src/index.ts](modules/protocols/besu/src/index.ts)

Typical mapping:

1. Grants and claims are modeled as domain records first.
2. A consortium may project them into Fabric when endorsement and private collections dominate, or into Besu when EVM contracts and privacy groups matter more.
3. The reconciliation report becomes the operational output that downstream finance teams and auditors review.

Why it fits:

- This scenario is governance-heavy, so the right protocol depends on the operating model more than on any single data structure.
