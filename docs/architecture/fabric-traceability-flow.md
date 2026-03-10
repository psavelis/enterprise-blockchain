# Fabric Traceability Flow

This document shows how the food recall scenario maps to a Fabric-style transaction flow.

```mermaid
sequenceDiagram
    participant QA as Quality Assurance
    participant App as Traceability App
    participant GW as Fabric Gateway
    participant Supplier as Supplier Peer
    participant Retailer as Retailer Peer
    participant Orderer as Ordering Service

    QA->>App: Flag suspect supplier or lot
    App->>GW: Build CreateProduct or RecordShipment invocation
    GW->>Supplier: Request endorsement
    GW->>Retailer: Request endorsement
    Supplier-->>GW: Endorsed read/write set
    Retailer-->>GW: Endorsed read/write set
    GW->>Orderer: Submit endorsed transaction
    Orderer-->>Supplier: Deliver ordered block
    Orderer-->>Retailer: Deliver ordered block
    Supplier-->>App: Commit event
    Retailer-->>App: Commit event
```

## Key Study Points

- Endorsement rules represent real organizational approval boundaries.
- Telemetry can be carried as transient data when it should not be fully replicated.
- Immediate finality makes recall scoping operationally practical.