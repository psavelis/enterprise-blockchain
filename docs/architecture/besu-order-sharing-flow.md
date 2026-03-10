# Besu Order Sharing Flow

This document shows how the consortium order-sharing scenario maps to a Besu privacy-group workflow.

```mermaid
sequenceDiagram
    participant Buyer as Buyer System
    participant App as Consortium App
    participant Contract as Besu Contract
    participant Bank as Bank Privacy Group
    participant Reg as Regulator Privacy Group
    participant Supplier as Supplier Privacy Group

    Buyer->>App: Publish canonical purchase order
    App->>Contract: anchorOrder(canonical metadata, audit proof)
    App->>Bank: publishAudienceView(bank payload)
    App->>Reg: publishAudienceView(regulator payload)
    App->>Supplier: publishAudienceView(supplier payload)
    Bank-->>App: Financing review against proof
    Reg-->>App: Compliance review against proof
    Supplier-->>App: Fulfillment review against proof
```

## Key Study Points

- A single canonical record can support multiple audience-specific payloads.
- Privacy groups keep non-essential fields away from other participants.
- Audit proofs preserve linkage between the partial view and the canonical order.