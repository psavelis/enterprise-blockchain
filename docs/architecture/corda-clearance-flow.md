# Corda Clearance Flow

This document shows how the staffing clearance scenario maps to a Corda-style state and flow model.

```mermaid
sequenceDiagram
    participant Hospital as Hospital Scheduler
    participant App as Clearance Service
    participant Flow as IssueProviderClearanceFlow
    participant Provider as Clinician
    participant Observer as Medical Board Observer
    participant Notary as Health Network Notary

    Hospital->>App: Request staffing clearance
    App->>App: Evaluate credentials and sanctions
    App->>Flow: Build ProviderClearanceState
    Flow->>Provider: Share proposed clearance state
    Flow->>Observer: Share need-to-know compliance state
    Flow->>Notary: Finality request
    Notary-->>Flow: Notarized transaction
    Flow-->>Hospital: Approved or rejected clearance state
```

## Key Study Points

- Parties receive the state because they are involved, not because the network broadly replicates all data.
- Approval and rejection are modeled as explicit contract commands.
- A notary provides uniqueness and finality without broadcasting everything to all members.