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
  section.twoCol {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
---

<!-- _class: lead -->

# Enterprise Blockchain Case Studies

TypeScript repository for enterprise blockchain design, protocol mapping, and integration boundaries.

**Scope**

- Case studies tied to operating problems
- Protocol-specific transaction models
- SDK-oriented integration patterns
- Off-chain cryptographic primitives (MPC, HSM, PQC)

---

# Repository Structure

| Area         | Purpose                                                  |
| ------------ | -------------------------------------------------------- |
| `modules/`   | Domain logic, protocol adapters, and integration clients |
| `examples/`  | Runnable case studies and protocol projections           |
| `contracts/` | Solidity source, Fabric chaincode, and ABI artifacts     |
| `docs/`      | Research, architecture notes, and presentation material  |
| `skills/`    | AI skill files for coding assistants and agents          |

---

# Operating Problems Covered

1. Food recall response
2. Consortium order sharing
3. Hospital staffing clearance
4. Aid voucher reconciliation

These scenarios require provenance, privacy, cross-organization coordination, or settlement controls.

---

# Off-Chain Cryptographic Patterns

| Pattern | Purpose |
| ------- | ------- |
| **MPC** | Joint computation without disclosing individual inputs |
| **HSM** | Hardware-protected key custody and signature provenance |
| **PQC** | Post-quantum cryptography for long-term confidentiality |

These complement ledger-based scenarios with cryptographic guarantees.

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
- Shared traceability across supplier, carrier, and retailer
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

![bg right:48% contain](./diagrams/17-mpc-secret-sharing.png)

# MPC: Secret Sharing

**Key point**

Parties compute a joint result without any participant revealing their individual input.

Repository examples:

- `mpc-sealed-bid-auction` — additive secret sharing
- `mpc-joint-risk-analysis` — cross-institution credit threshold

---

<!-- _class: compact -->

# MPC: Threshold Schemes

**Shamir Secret Sharing (k-of-n)**

Distribute a secret so that any k shares reconstruct it, but k−1 shares reveal nothing.

Repository example:

- `quantum-resistant-key-sharing` — 3-of-5 Shamir threshold with hash-ladder anchoring for post-quantum auditability

---

<!-- _class: compact -->

![bg right:48% contain](./diagrams/18-hsm-envelope.png)

# HSM Key Management

**Key point**

Private keys and raw symmetric material never leave the HSM boundary. Only signatures, public keys, and wrapped DEKs appear on-chain.

---

<!-- _class: compact -->

# HSM Examples

| Example | Pattern |
| ------- | ------- |
| `hsm-transaction-signing` | EC P-256 trade order signing with HSM attestation |
| `hsm-key-ceremony` | 3-of-5 Shamir custodianship + HSM-signed certificate |
| `hsm-envelope-encryption` | DEK/KEK pattern for on-ledger document confidentiality |

---

<!-- _class: compact -->

# Post-Quantum Cryptography

**NIST FIPS 203 & 204 (2024)**

| Standard | Algorithm | Purpose |
| -------- | --------- | ------- |
| FIPS 203 | ML-KEM (Kyber) | Key encapsulation mechanism |
| FIPS 204 | ML-DSA (Dilithium) | Digital signature algorithm |

These provide quantum-resistant replacements for RSA, ECDH, and ECDSA.

---

<!-- _class: compact -->

# Kyber KEM Key Exchange

**ML-KEM (FIPS 203)**

- Lattice-based key encapsulation
- Parameter sets: ML-KEM-512, ML-KEM-768, ML-KEM-1024
- Shared secret derived via encapsulation/decapsulation

Repository example:

- `kyber-kem-key-exchange` — Full ML-KEM roundtrip with audit records

---

<!-- _class: compact -->

# Hybrid KEM Settlement

**X25519 + ML-KEM-768**

Combines classical (X25519) and post-quantum (ML-KEM) key exchange for defense-in-depth.

- HKDF combines both shared secrets
- Provides security even if one primitive breaks
- Backward compatibility with classical systems

Repository example:

- `hybrid-kem-settlement` — Settlement channel with hybrid key agreement

---

<!-- _class: compact -->

# Quantum-Safe Payment Flow

**End-to-end post-quantum security**

1. **Key ceremony** — Hybrid KEM key pairs (X25519 + ML-KEM)
2. **Signing** — ML-DSA-65 digital signatures (FIPS 204)
3. **Encryption** — AES-256-GCM with hybrid-derived key
4. **Authorization** — 3-of-3 MPC threshold settlement

Repository example:

- `quantum-safe-payment` — Full FX settlement with PQC primitives

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
4. Environment configuration supplies credentials and endpoints.

---

<!-- _class: compact -->

![bg right:48% contain](./diagrams/14-aura-erc721-flow.png)

# Besu Path

Repository assets:

- Solidity source in `contracts/solidity/src/`
- ABI artifacts in `contracts/`
- `ethers` integration in `modules/integrations/besu-client/`

---

<!-- _class: compact -->

![bg right:48% contain](./diagrams/15-chaincode-walkthrough.png)

# Fabric Path

Repository assets:

- Chaincode in `contracts/fabric/`
- Proposal builders in `modules/protocols/fabric/`
- Gateway integration in `modules/integrations/fabric-gateway/`

---

<!-- _class: compact -->

# Corda Path

TypeScript is the integration layer, not the CorDapp runtime.

Repository assets:

- Kotlin contracts in `contracts/corda/`
- Flow projection in `modules/protocols/corda/`
- Gateway builder in `modules/integrations/corda-gateway/`

---

# Quick Start

```bash
npm install
npm run verify
npm run demo:adapters
npm run demo:integrations
```

---

# Case Study Examples

```bash
npm run example:food-recall
npm run example:order-sharing
npm run example:staffing-clearance
npm run example:aid-reconciliation
```

---

# Protocol Projection Examples

```bash
npm run example:fabric-projection
npm run example:besu-projection
npm run example:corda-projection
npm run example:fabric-gateway
npm run example:besu-ethers
npm run example:corda-rest
```

---

# MPC & Threshold Examples

```bash
npm run example:mpc-auction
npm run example:mpc-risk-analysis
npm run example:quantum-key-sharing
```

---

# HSM Examples

```bash
npm run example:hsm-tx-signing
npm run example:hsm-key-ceremony
npm run example:hsm-envelope-encryption
```

---

# Post-Quantum Examples

```bash
npm run example:kyber-kem
npm run example:hybrid-kem
npm run example:quantum-safe-payment
```

---

# Navigation Guide

| Goal | Start Here |
| ---- | ---------- |
| Understand a scenario | `examples/` folder |
| Read domain logic | `modules/` folder |
| Review protocol shapes | `modules/protocols/` |
| See integration patterns | `modules/integrations/` |
| Study architecture | `docs/architecture/` |

---

<!-- _class: lead -->

# Summary

- **4** operating problems with domain modules
- **3** protocol adapters (Fabric, Besu, Corda)
- **3** integration clients (Gateway, ethers, REST)
- **6** MPC/HSM/PQC cryptographic examples

All examples pass `npm run verify` and run offline.
