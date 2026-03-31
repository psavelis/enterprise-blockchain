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

- Scenario: [examples/aid-voucher-reconciliation/index.ts](../../examples/aid-voucher-reconciliation/index.ts)
- Domain logic: [modules/aid-settlement/src/index.ts](../../modules/aid-settlement/src/index.ts)
- Smart contract: [contracts/solidity/src/AidSettlement.sol](../../contracts/solidity/src/AidSettlement.sol)
- Protocol adapters: [modules/protocols/fabric/](../../modules/protocols/fabric/) and [modules/protocols/besu/](../../modules/protocols/besu/)

### Domain Model

```typescript
// Core entities from modules/aid-settlement/src/domain/entities.ts
AidGrant     { grantId, beneficiaryId, program, issuedAt, expiresAt, approvedCategories, amountUsd }
RedemptionClaim { claimId, grantId, merchantId, merchantCategory, invoiceReference, amountUsd, submittedAt }
ReconciliationReport { settledClaims[], rejectedClaims[], summary }
```

### Besu Mapping (EVM Smart Contract)

The `AidSettlement.sol` contract mirrors the off-chain reconciliation rules:

| Domain Operation     | Solidity Function                                                                                       | On-chain Effect                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `issueGrant(grant)`  | `registerGrant(grantId, beneficiaryId, program, issuedAt, expiresAt, approvedCategories, amountUsd100)` | Stores grant with budget cap and category allow-list                   |
| `submitClaim(claim)` | `submitClaim(claimId, grantId, merchantId, merchantCategory, invoiceReference, amountUsd100)`           | Validates against grant rules, emits `ClaimSettled` or `ClaimRejected` |
| `reconcile()`        | Query settled/rejected events                                                                           | Reconciliation report derived from event log                           |

Validation rules enforced on-chain:

- Budget cap: `consumedUsd + amountUsd <= grant.amountUsd`
- Expiry: `block.timestamp < grant.expiresAt`
- Category: `merchantCategory ∈ grant.approvedCategories`
- Duplicate invoice: `!usedInvoices[grantId][invoiceReference]`

### Fabric Mapping (Chaincode)

For organizations preferring endorsement-based finality:

| Domain Operation     | Chaincode Function             | Endorsement Policy |
| -------------------- | ------------------------------ | ------------------ |
| `issueGrant(grant)`  | `CreateGrant`                  | Agency + Auditor   |
| `submitClaim(claim)` | `SubmitClaim`                  | Merchant + Agency  |
| `reconcile()`        | `GenerateReconciliationReport` | Auditor required   |

Private data collections separate merchant invoices from auditor-visible summaries.

### Why Both Protocols Fit

- **Besu**: Consortium networks where EVM contracts, gas metering, and privacy groups are established. Auditors verify settlement by replaying contract state.
- **Fabric**: Organizations with existing Hyperledger infrastructure and endorsement-based governance. Private collections isolate sensitive financial data.

The domain layer (`AidSettlementLedger`) remains protocol-agnostic. Teams choose the protocol adapter based on their operational model rather than data structure requirements.
