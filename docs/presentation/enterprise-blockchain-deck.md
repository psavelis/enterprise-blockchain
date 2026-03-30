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
    padding: 40px 48px;
    font-size: 28px;
    line-height: 1.35;
  }
  h1, h2 {
    color: #0f2742;
    margin: 0 0 16px 0;
  }
  strong {
    color: #0b5cab;
  }
  img {
    background: transparent;
    display: block;
    margin: 0 auto;
  }
  code {
    font-family: "SFMono-Regular", "Menlo", monospace;
    font-size: 0.85em;
  }
  p, li {
    font-size: 0.82em;
  }
  table {
    width: 100%;
    font-size: 0.75em;
  }
  section.lead h1 {
    margin-top: 36px;
  }
  section.compact p,
  section.compact li {
    font-size: 0.72em;
  }
  section.compact table {
    font-size: 0.68em;
  }
---

<!-- _class: lead -->

# Enterprise Blockchain Case Studies

TypeScript repository demonstrating enterprise blockchain patterns.

**Focus areas**

- Operational case studies (traceability, privacy, credentials, settlement)
- Protocol adapters (Fabric, Besu, Corda)
- Off-chain cryptography (MPC, HSM, post-quantum)

---

# Repository Structure

| Folder | Contents |
| ------ | -------- |
| `modules/` | Domain logic, protocol adapters, integration clients |
| `examples/` | 20 runnable scenarios |
| `contracts/` | Solidity (Foundry), Fabric chaincode (TS), Corda (Kotlin) |
| `docs/` | Architecture decisions, flow diagrams, this deck |
| `skills/` | AI skill files for assisted development |

---

<!-- _class: compact -->

# Case Studies

| Scenario | Domain Problem | Protocol Fit |
| -------- | -------------- | ------------ |
| Food recall | Trace contaminated lots across supply chain | Fabric (channel isolation) |
| Order sharing | Selective disclosure to bank/logistics/regulator | Besu (privacy groups) |
| Staffing clearance | Verify credentials before clinical assignment | Corda (point-to-point) |
| Aid reconciliation | Multi-agency voucher settlement | Besu (shared state) |

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/09-decision-framework.png)

# Platform Selection

Decision tree for protocol choice:

- Data integrity only → **KSI / Guardtime**
- Public anchoring → **Bitcoin / Ethereum**
- Bilateral flows → **Corda**
- EVM ecosystem → **Besu**
- Channel isolation → **Fabric**

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/01-fabric-tx-flow.png)

# Fabric: Endorsement Flow

1. Client submits proposal
2. Endorsing peers simulate chaincode
3. Client collects endorsements
4. Orderer batches into block
5. All peers validate and commit

Use case: **Food recall traceability**

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/12-privacy-patterns.png)

# Privacy Patterns

| Platform | Mechanism |
| -------- | --------- |
| Fabric | Private data collections, transient data |
| Besu | Privacy groups, restricted contract state |
| Corda | Need-to-know state distribution |

Use case: **Consortium order sharing**

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/13-corda-credential-flow.png)

# Corda: Flow Protocol

1. Issuer builds `CredentialState`
2. Contract verifies locally
3. `CollectSignaturesFlow` gathers counterparty signatures
4. Notary checks uniqueness
5. `FinalityFlow` distributes to participants

Use case: **Hospital staffing clearance**

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/16-wfp-aid-flow.png)

# Settlement Controls

- Agency registers and allocates funds
- Beneficiary redeems at POS
- Contract enforces budget limits
- Cross-agency duplicate detection

Use case: **Aid voucher reconciliation**

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/17-mpc-secret-sharing.png)

# MPC: Additive Secret Sharing

Parties split inputs into additive shares:

```
secret = share₁ + share₂ + share₃ (mod p)
```

Computation happens on shares; result reconstructed.

Examples: `mpc-sealed-bid-auction`, `mpc-joint-risk-analysis`

---

<!-- _class: compact -->

# MPC: Threshold Schemes

**Shamir Secret Sharing (k-of-n)**

- Polynomial interpolation over finite field
- Any k shares reconstruct; k-1 reveal nothing
- Used for key custody and quorum authorization

Example: `quantum-resistant-key-sharing` — 3-of-5 threshold + hash-ladder anchoring

---

<!-- _class: compact -->

![bg right:52% fit](./diagrams/18-hsm-envelope.png)

# HSM: Envelope Encryption

1. Generate ephemeral DEK (256-bit)
2. Encrypt payload with DEK (AES-GCM)
3. Wrap DEK with KEK inside HSM
4. Store `ciphertext + wrappedDEK`
5. Only HSM can unwrap

Private keys never leave hardware boundary.

---

<!-- _class: compact -->

# HSM Examples

| Example | Pattern |
| ------- | ------- |
| `hsm-transaction-signing` | EC P-256 ECDSA with audit digest |
| `hsm-key-ceremony` | 3-of-5 Shamir + HSM-signed root certificate |
| `hsm-envelope-encryption` | DEK/KEK for on-ledger document confidentiality |

---

<!-- _class: compact -->

# Post-Quantum Cryptography

**NIST Standards (August 2024)**

| Standard | Algorithm | Wire Sizes |
| -------- | --------- | ---------- |
| FIPS 203 | ML-KEM-768 | pk: 1184 B, ct: 1088 B, ss: 32 B |
| FIPS 204 | ML-DSA-65 | pk: 1952 B, sig: 3309 B |

Replaces RSA/ECDH (key exchange) and ECDSA (signatures).

---

<!-- _class: compact -->

# ML-KEM Key Encapsulation

**Lattice-based KEM (FIPS 203)**

1. Recipient generates `(pk, sk)`
2. Sender: `(ciphertext, sharedSecret) = encapsulate(pk)`
3. Recipient: `sharedSecret = decapsulate(sk, ciphertext)`

Parameter sets: ML-KEM-512, ML-KEM-768, ML-KEM-1024

Example: `kyber-kem-key-exchange`

---

<!-- _class: compact -->

# Hybrid KEM

**X25519 + ML-KEM-768**

```
combinedSecret = HKDF(x25519Secret || mlkemSecret)
```

- Defense-in-depth: secure if either primitive holds
- Recommended for transition period
- Backward compatible with classical peers

Example: `hybrid-kem-settlement`

---

<!-- _class: compact -->

# Quantum-Safe Payment Flow

| Phase | Primitive |
| ----- | --------- |
| Key ceremony | Hybrid KEM (X25519 + ML-KEM-768) |
| Sign instruction | ML-DSA-65 (FIPS 204) |
| Encrypt payload | AES-256-GCM with hybrid key |
| Authorize settlement | 3-of-3 MPC threshold |

Example: `quantum-safe-payment`

---

<!-- _class: compact -->

![bg right:50% fit](./diagrams/11-consensus-comparison.png)

# Consensus Comparison

| Protocol | Consensus | Finality |
| -------- | --------- | -------- |
| Fabric | Raft / BFT | Immediate |
| Besu | QBFT / IBFT 2.0 | Immediate |
| Corda | Notary (single/clustered) | Immediate |

All provide deterministic finality (no forks).

---

<!-- _class: compact -->

# Architecture Layers

| Layer | Responsibility | Location |
| ----- | -------------- | -------- |
| Domain | Business rules, entities | `modules/{domain}/` |
| Protocol | Platform-specific tx shapes | `modules/protocols/` |
| Integration | SDK bindings, retry, errors | `modules/integrations/` |
| Config | Endpoints, credentials | `examples/config/` |

---

<!-- _class: compact -->

![bg right:50% fit](./diagrams/14-aura-erc721-flow.png)

# Besu Integration

**Stack**: Solidity + ethers.js + privacy groups

Repository assets:
- `contracts/solidity/src/` — Foundry project
- `modules/integrations/besu-client/` — tx builders
- `modules/protocols/besu/` — privacy group calls

---

<!-- _class: compact -->

![bg right:50% fit](./diagrams/15-chaincode-walkthrough.png)

# Fabric Integration

**Stack**: TypeScript chaincode + Gateway SDK

Repository assets:
- `contracts/fabric/` — FoodTraceContract
- `modules/integrations/fabric-gateway/` — proposal builders
- `modules/protocols/fabric/` — invoke/query shapes

---

<!-- _class: compact -->

# Corda Integration

**Stack**: Kotlin CorDapp + REST gateway

Repository assets:
- `contracts/corda/` — ProviderClearanceContract/Flow/State
- `modules/integrations/corda-gateway/` — HTTP request builders
- `modules/protocols/corda/` — flow invocation shapes

TypeScript handles the integration boundary, not CorDapp runtime.

---

# Quick Start

```bash
npm install          # install dependencies
npm run verify       # format + lint + typecheck + test + examples
npm run demo:adapters       # protocol adapter projections
npm run demo:integrations   # SDK integration sketches
```

All examples run offline with mocked SDK boundaries.

---

<!-- _class: compact -->

# Example Commands

| Category | Commands |
| -------- | -------- |
| Case studies | `example:food-recall`, `example:order-sharing`, `example:staffing-clearance`, `example:aid-reconciliation` |
| Protocol | `example:fabric-projection`, `example:besu-projection`, `example:corda-projection` |
| Integration | `example:fabric-gateway`, `example:besu-ethers`, `example:corda-rest` |
| MPC | `example:mpc-auction`, `example:mpc-risk-analysis`, `example:quantum-key-sharing` |
| HSM | `example:hsm-tx-signing`, `example:hsm-key-ceremony`, `example:hsm-envelope-encryption` |
| PQC | `example:kyber-kem`, `example:hybrid-kem`, `example:quantum-safe-payment` |

---

# Navigation

| Goal | Start |
| ---- | ----- |
| Run a scenario | `examples/` |
| Read domain logic | `modules/{domain}/src/` |
| See protocol shapes | `modules/protocols/` |
| Study integration patterns | `modules/integrations/` |
| Review architecture | `docs/architecture/` |

---

<!-- _class: lead -->

# Summary

- **4** case studies (traceability, privacy, credentials, settlement)
- **3** protocol adapters (Fabric, Besu, Corda)
- **3** integration clients (Gateway, ethers, REST)
- **9** cryptographic examples (3 MPC + 3 HSM + 3 PQC)

All pass `npm run verify` and run offline.
