# Architecture Overview

This repository separates business-domain logic from blockchain-protocol concerns.

## Layering

```mermaid
flowchart TD
    A[Case Study Scenarios] --> B[Domain Modules]
    B --> C[Protocol Adapters]
    C --> D[Enterprise Blockchain Runtime]

    A1[Food Recall Response] --> A
    A2[Consortium Order Sharing] --> A
    A3[Hospital Staffing Clearance] --> A
    A4[Aid Voucher Reconciliation] --> A
    A5[MPC Sealed-Bid Auction] --> A
    A6[MPC Joint Risk Analysis] --> A
    A7[Quantum-Resistant Key Sharing] --> A

    B1[Traceability] --> B
    B2[Selective Disclosure] --> B
    B3[Credentialing] --> B
    B4[Aid Settlement] --> B
    B5[MPC / Secret Sharing] --> B

    C1[Fabric Adapter] --> C
    C2[Besu Adapter] --> C
    C3[Corda Adapter] --> C

    D1[Chaincode / Endorsement Flow] --> D
    D2[EVM Contract / Privacy Group Flow] --> D
    D3[State Flow / Need-to-Know Flow] --> D
```

## Design Rationale

- Domain modules stay readable and easy to test.
- Protocol adapters make platform assumptions explicit instead of leaking them into business rules.
- Examples remain useful before a team commits to a specific blockchain runtime.

## Reading Path

- Start with the scenario in `examples/`.
- Inspect the corresponding domain logic in `modules/`.
- For ledger-bound scenarios, review the protocol adapter to see how the domain event maps to Fabric, Besu, or Corda.
- For MPC and key management scenarios, see `docs/architecture/mpc-quantum-resistance.md`; these examples are intentionally off-chain.
- Use the platform decision matrix to discuss deployment tradeoffs.
