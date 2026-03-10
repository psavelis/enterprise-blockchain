---
marp: true
theme: default
paginate: true
size: 16:9
title: Enterprise Blockchain Case Studies
description: Case studies, protocol mappings, and integration patterns
style: |
  section {
    font-family: "Aptos", "Segoe UI", sans-serif;
    background: #f6f7f9;
    color: #17202a;
    padding: 44px 52px;
    font-size: 30px;
    line-height: 1.3;
  }
  h1, h2 {
    color: #0f2742;
    margin: 0 0 18px 0;
  }
  strong {
    color: #0b5cab;
  }
  img {
    background: transparent;
    display: block;
    margin: 0 auto;
    max-width: 100%;
    max-height: 58vh;
    object-fit: contain;
  }
  code {
    font-family: "SFMono-Regular", "Menlo", monospace;
  }
  p, li, table {
    font-size: 0.78em;
  }
  table {
    width: 100%;
  }
  section.lead h1 {
    margin-top: 40px;
  }
  section.compact p,
  section.compact li,
  section.compact table {
    font-size: 0.72em;
  }
---

<!-- _class: lead -->
# Enterprise Blockchain Case Studies

TypeScript repository for enterprise blockchain design, protocol mapping, and integration boundaries.

**Scope**

- Case studies tied to operating problems
- Protocol-specific transaction models
- SDK-oriented integration patterns

---

# Repository Structure

| Area | Purpose |
|---|---|
| `modules/` | Domain logic, protocol adapters, and integration clients |
| `examples/` | Runnable case studies and protocol projections |
| `contracts/` | Solidity contract source and ABI artifact |
| `docs/` | Research, architecture notes, and presentation material |

---

# Operating Problems Covered

1. Food recall response
2. Consortium order sharing
3. Hospital staffing clearance
4. Aid voucher reconciliation

These scenarios were selected because they require provenance, privacy, cross-organization coordination, or settlement controls.

---

<!-- _class: compact -->
![bg right:48% contain](./diagrams/09-decision-framework.png)

# Architecture Model

- Domain modules hold the business rules.
- Protocol adapters capture platform semantics.
- Integration clients shape runtime requests.
- Environment configuration supplies operational inputs.

---

<!-- _class: compact -->
![bg right:50% contain](./diagrams/01-fabric-tx-flow.png)

# Food Recall Response

**Why it matters**

- Rapid impact analysis during a recall
- Shared traceability across supplier, carrier, and retailer boundaries
- Deterministic commit model for operational response

---

<!-- _class: compact -->
![bg right:50% contain](./diagrams/12-privacy-patterns.png)

# Selective Disclosure

**Key point**

The same commercial record can be anchored once and disclosed differently to logistics, banking, regulatory, and supplier audiences.

---

<!-- _class: compact -->
![bg right:50% contain](./diagrams/13-corda-credential-flow.png)

# Credential Verification

**Key point**

Need-to-know distribution is often a better fit than broad ledger replication for regulated staffing workflows.

---

<!-- _class: compact -->
![bg right:50% contain](./diagrams/16-wfp-aid-flow.png)

# Reconciliation And Controls

**Key point**

Shared ledgers matter when multiple organizations need one settlement view without delegating control to a single operator.

---

<!-- _class: compact -->
![bg right:50% contain](./diagrams/11-consensus-comparison.png)

# Platform Fit

Decision criteria in this repository:

- Governance model
- Privacy boundary
- Finality model
- Integration surface

---

<!-- _class: compact -->
# From Domain Logic To Runtime

1. Domain module defines the business rule.
2. Protocol adapter maps the event into a platform-specific transaction.
3. Integration client shapes the request for the runtime boundary.
4. Environment configuration supplies credentials, endpoints, and contract addresses.

---

<!-- _class: compact -->
![bg right:48% contain](./diagrams/14-aura-erc721-flow.png)

# Besu Path

Repository assets:

- Solidity source in `contracts/ConsortiumOrderRegistry.sol`
- ABI artifact in `contracts/ConsortiumOrderRegistry.json`
- `ethers` integration in `modules/integrations/besu-client/`

---

<!-- _class: compact -->
![bg right:48% contain](./diagrams/15-chaincode-walkthrough.png)

# Fabric Path

Repository assets:

- Proposal builders in `modules/protocols/fabric/`
- Gateway integration in `modules/integrations/fabric-gateway/`
- Environment template in `examples/config/fabric.env.example`

---

<!-- _class: compact -->
# Corda Path

TypeScript is the integration layer, not the CorDapp runtime.

Repository assets:

- Clearance flow projection in `modules/protocols/corda/`
- Gateway request builder in `modules/integrations/corda-gateway/`
- Environment template in `examples/config/corda.env.example`

---

# How To Use The Repository

```bash
npm install
npm run verify
npm run demo:adapters
npm run demo:integrations
```

Then move from `examples/` to `modules/` to `docs/architecture/`.