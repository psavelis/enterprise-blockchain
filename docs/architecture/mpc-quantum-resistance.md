# MPC and Quantum Resistance

How multi-party computation (MPC) and hash-based anchoring fit the repository's layered architecture, and when to choose each privacy pattern.

## Position in the architecture

```
Case Study Scenarios
  └─ mpc-sealed-bid-auction, mpc-joint-risk-analysis, quantum-resistant-key-sharing
Domain Modules
  └─ modules/mpc   (MPCEngine, QuantumResistantVault)
Protocol Adapters
  └─ (off-chain by nature — MPC complements blockchain rather than deploying to one)
Integration Clients
  └─ results can be anchored on-chain via existing Besu/Fabric adapters
```

MPC is inherently **off-chain**: parties compute directly on secret shares without a blockchain intermediary. The blockchain layer can anchor MPC outputs (commitment hashes, computation proofs) for auditability, using the same `auditProof` pattern from the privacy module.

## When to use MPC vs. other privacy patterns

| Pattern                       | Mechanism                                                     | Best for                                                  | Overhead                                    |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| **Selective disclosure**      | Audience-specific projections of a canonical record           | Role-based data minimization within a known consortium    | Low — application logic only                |
| **Privacy groups / channels** | Platform-level data isolation (Besu Tessera, Fabric channels) | Organizational data boundaries                            | Medium — network configuration              |
| **Zero-knowledge proofs**     | Prove a statement without revealing the underlying data       | Verification without disclosure (e.g., drug authenticity) | High — circuit construction                 |
| **MPC**                       | Compute on secret-shared inputs across multiple parties       | Joint computation where no party should see others' data  | High — communication rounds between parties |

Choose MPC when:

- Multiple organizations need to **compute a joint result** (not just share data).
- No single party should see the raw inputs of others.
- The computation is high-value enough to justify inter-party communication overhead.

## Quantum threat model

### Shor's algorithm (asymmetric crypto)

Shor's algorithm efficiently factors large integers and computes discrete logarithms, breaking:

- **RSA** — key recovery from public key
- **ECDSA / EdDSA** — private key recovery from public key
- **DH / ECDH** — shared secret recovery from public parameters

Timeline estimates vary (2030–2040+), but the **harvest-now-decrypt-later** threat is immediate: adversaries can record encrypted traffic today and decrypt once quantum hardware matures.

### Grover's algorithm (symmetric crypto)

Grover's algorithm provides a quadratic speedup for brute-force search, effectively halving the security level of symmetric primitives:

- **AES-256** → 128-bit effective security (still secure)
- **SHA-256** → 128-bit collision resistance (still secure)

### Why MPC and hash-based anchoring survive

| Approach                                       | Quantum impact                                                        | Status                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| **Additive / Shamir secret sharing**           | Shares are random values — no algebraic structure for Shor to exploit | Safe                                    |
| **SHA-256 commitments / hash ladders**         | Grover reduces 256→128 bits; no practical break                       | Safe                                    |
| **MPC protocols (additive, garbled circuits)** | Operate on shares, not asymmetric keys                                | Safe (transport layer must be upgraded) |
| **RSA / ECDSA signatures**                     | Shor breaks entirely                                                  | Vulnerable                              |
| **TLS (key exchange)**                         | ECDH broken by Shor; migrate to ML-KEM / Kyber                        | Vulnerable (transport)                  |

MPC distributes secrets so there is no single key to steal. Even if a quantum adversary compromises some parties (below threshold), the secret cannot be reconstructed.

## Implementation notes

### Secret sharing schemes

`MPCEngine` uses **additive secret sharing** for collaborative computation:

- Split secret `s` into `n` random values where `s = v₁ + v₂ + … + vₙ`.
- All `n` shares are needed to reconstruct — every party participates.

`QuantumResistantVault` uses **Shamir's Secret Sharing** for threshold key distribution:

- Evaluate a degree-(k-1) polynomial at `n` distinct points over a finite field.
- Any `k` points reconstruct the polynomial (and the secret at x=0).
- Fewer than `k` points reveal no information.

### Communication overhead

Real MPC protocols incur communication rounds proportional to circuit depth:

- **Semi-honest (passive)**: 2–3 rounds for additive sharing protocols.
- **Malicious (active security)**: 5+ rounds with MAC-based verification (SPDZ protocol).
- **Garbled circuits**: Constant rounds but high bandwidth (circuit transmission).

For high-value computations (financial risk, healthcare analytics), this overhead is justified.

### Libraries for production use

- **MP-SPDZ** — Multi-protocol framework supporting SPDZ, MASCOT, semi-honest protocols.
- **EMP-toolkit** — Garbled circuits and oblivious transfer for two-party computation.
- **MOTION** — C++ framework for mixed-protocol MPC (arithmetic + Boolean).
- **ABY/ABY3** — Efficient two/three-party computation with arithmetic, Boolean, and Yao sharing.

## References

- Chainlink Education Hub: MPC wallets and threshold signatures.
- IEEE Digital Privacy: privacy-preserving analytics via secret sharing.
- NIST Post-Quantum Cryptography: ML-KEM (Kyber), ML-DSA (Dilithium) standardization.
- Estonia KSI: hash-based integrity infrastructure (Guardtime).
- Qredo, Cyfrin, HackerNoon: MPC wallet architectures and quantum readiness patterns.

---

## ML-KEM (Kyber) — Key Encapsulation in Practice

The sections above explain why MPC and hash-based anchoring survive quantum attacks. This section covers the layer that _does_ need replacing: **asymmetric key exchange** (ECDH/RSA used in TLS and inter-party communication channels).

### What a KEM is and why it replaces ECDH

A **Key Encapsulation Mechanism** solves the same problem as Diffie-Hellman key exchange: two parties who have never met need to establish a shared secret key over an untrusted channel. The difference is the mechanism:

| Scheme            | How it works                                                                            | Quantum-safe?                           |
| ----------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| ECDH              | Both sides contribute public parameters; shared secret = DH product                     | No — Shor's breaks it                   |
| RSA key transport | Sender encrypts session key with recipient's public key                                 | No — Shor's breaks RSA                  |
| **ML-KEM**        | Sender _encapsulates_ a random shared secret; recipient _decapsulates_ using secret key | **Yes** — based on MLWE lattice problem |

The key insight: ML-KEM's hardness assumption is the **Module Learning With Errors** (MLWE) problem. No polynomial-time quantum algorithm is known to solve MLWE — Grover's gives a quadratic speedup to brute-force search but does not break the algebraic structure that MLWE relies on.

**Standard:** NIST FIPS 203 (finalised August 2024)
**Reference:** https://csrc.nist.gov/pubs/fips/203/final

### ML-KEM parameter sets

| Parameter Set  | NIST Level  | Public Key  | Secret Key  | Ciphertext  | Post-Quantum Security             | Recommended for                                               |
| -------------- | ----------- | ----------- | ----------- | ----------- | --------------------------------- | ------------------------------------------------------------- |
| ML-KEM-512     | Level 1     | 800 B       | 1 632 B     | 768 B       | ~128-bit (AES-128 equivalent)     | Constrained devices, short-lived sessions                     |
| **ML-KEM-768** | **Level 3** | **1 184 B** | **2 400 B** | **1 088 B** | **~192-bit (AES-192 equivalent)** | **General enterprise use — NIST recommended**                 |
| ML-KEM-1024    | Level 5     | 1 568 B     | 3 168 B     | 1 568 B     | ~256-bit (AES-256 equivalent)     | Long-lived data, central bank keys, 30+ year security horizon |

The number (512/768/1024) refers to the module dimension `k` of the underlying polynomial ring — larger `k` means larger keys and ciphertexts but stronger security margins.

### Relationship to existing QuantumResistantVault

`QuantumResistantVault` (in `modules/mpc/src/quantum.ts`) and `KyberKem` (in `modules/mpc/src/kyber.ts`) solve _different_ problems and are **complementary**, not alternatives:

| Component               | Protects                                                                      | Mechanism                                        | Quantum safe?                       |
| ----------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| `QuantumResistantVault` | Key material at rest — how a signing key is _stored_ across parties           | Shamir SSS over GF(2³¹−1) + SHA-256 hash ladders | Yes — no asymmetric crypto involved |
| `KyberKem`              | Key material _in transit_ — how a session key is _established_ over a channel | ML-KEM encapsulation                             | Yes — MLWE lattice                  |

In a complete post-quantum architecture you need both: `KyberKem` to establish the channel key, then `QuantumResistantVault` to distribute long-term secret keys among custodians.

### Hybrid KEM for the transition period

During the 2024–2030 transition window, most production deployments combine classical ECDH with ML-KEM. The combined key is:

```
ikm  = x25519_shared_secret ∥ kyber_shared_secret
key  = HKDF-SHA256(ikm, salt=0x00…00, info="hybrid-kem-v1", length=32)
```

Breaking the combined key requires breaking **both** channels simultaneously:

- **X25519** provides protection against adversaries without quantum hardware (which describes all known adversaries today)
- **ML-KEM-768** provides protection against adversaries with a CRQC

Real-world deployments using this construction as of 2024:

- Chrome/Chromium: X25519Kyber768 shipped to stable, August 2023
- Cloudflare: ML-KEM hybrid for TLS 1.3 termination
- Signal: PQXDH specification (post-quantum extended Diffie-Hellman)

IETF draft formalising the construction: https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/

### Integration with Fabric/Besu/Corda adapters

The `auditCommitment` produced by `KyberKem.encapsulate()` — a SHA-256 hex digest of the ciphertext — can be written to any of the protocol adapters:

```typescript
// After establishing a session key:
const encap = kem.encapsulate(recipientPublicKey, "ml-kem-768");
const audit = kem.auditRecord(encap, recipientPublicKey, "ml-kem-768");

// Anchor to Fabric ledger (using FabricAdapter from modules/protocols/fabric):
await fabricAdapter.submitTransaction("LogKeyExchange", JSON.stringify(audit));

// Or Besu (write to ConsortiumOrderRegistry / custom contract):
await besuAdapter.writeAuditLog(audit.ciphertextHash, audit.timestamp);
```

This gives regulators and auditors a cryptographic receipt that a specific key exchange occurred for a specific transaction, without exposing the shared secret or the decrypted payload.

### Migration path for existing adapters

The existing protocol integrations in `modules/integrations/` negotiate TLS via `@grpc/grpc-js` (Fabric), `ethers` (Besu), and HTTP (Corda). These use the underlying TLS stack's key exchange, which is classical ECDH in default Node.js TLS configurations.

Migration steps when a CRQC threat becomes imminent:

1. Replace per-message ECDH with `KyberKem` for application-level key establishment
2. Wrap the resulting key in `HybridKem` during the transition period
3. When the Fabric/Besu/Corda SDKs add native PQ-TLS support, remove the hybrid shim

The `modules/mpc/src/kyber.ts` and `modules/mpc/src/hybrid-kem.ts` modules are designed to slot into this migration path without changing the rest of the application layer.

---

## ML-DSA (Dilithium) — Digital Signatures in Practice

### What ML-DSA replaces

| Classical scheme | Quantum-safe replacement | NIST standard |
| ---------------- | ------------------------ | ------------- |
| ECDSA (P-256)    | ML-DSA-44                | FIPS 204      |
| ECDSA (P-384)    | ML-DSA-65                | FIPS 204      |
| ECDSA (P-521)    | ML-DSA-87                | FIPS 204      |

ML-DSA is based on the Module-Learning With Errors (MLWE) and Module Short Integer Solution (MSIS) hard problems. Unlike ECDSA, it has no known quantum speedup beyond Grover's algorithm (which does not break signature schemes the way Shor's breaks key exchange and RSA).

### Parameter set guidance

| Parameter set | Security level | Public key | Secret key | Signature | Recommended for                                     |
| ------------- | -------------- | ---------- | ---------- | --------- | --------------------------------------------------- |
| ML-DSA-44     | NIST Level 2   | 1 312 B    | 2 560 B    | 2 420 B   | Short-lived tokens, code signing (post-2030 only)   |
| ML-DSA-65     | NIST Level 3   | 1 952 B    | 4 032 B    | 3 309 B   | **General use** — payment authorizations, TLS certs |
| ML-DSA-87     | NIST Level 5   | 2 592 B    | 4 896 B    | 4 627 B   | Root CAs, long-lived documents (30+ year trust)     |

**Byte lengths are empirically verified against `@noble/post-quantum` v0.5.4 (FIPS 204 compliant).**

Noble's secret key representation includes expanded key material alongside the algebraic seed; hence `sk` lengths are larger than the FIPS 204 §7 algebraic key sizes.

### Noble API shape (`@noble/post-quantum/ml-dsa.js`)

The ML-DSA argument order in `@noble/post-quantum` differs from ML-KEM — note message is first in `sign`:

```typescript
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

const { publicKey, secretKey } = ml_dsa65.keygen();

// sign(message, secretKey) — message first
const signature = ml_dsa65.sign(messageBytes, secretKey);

// verify(signature, message, publicKey) — signature first
const valid = ml_dsa65.verify(signature, messageBytes, publicKey);
```

### Hybrid signing for the transition period

During migration, use ML-DSA alongside ECDSA — require both to validate:

```typescript
// Meridian signs with both schemes
const ecdsaSig = ecdsaKey.sign(messageHash);
const mlDsaSig = mlDsaSigner.sign(messageBytes, mlDsaSecretKey, "ml-dsa-65");

// NovaPay verifies both — settlement requires BOTH to pass
const classicalOk = ecdsaPublicKey.verify(messageHash, ecdsaSig);
const postQuantumOk = mlDsaSigner.verify(
  messageBytes,
  mlDsaSig.signature,
  mlDsaPublicKey,
  "ml-dsa-65",
);
const authorized = classicalOk && postQuantumOk;
```

This ensures that:

- If ECDSA is broken (quantum attack), ML-DSA still protects the signature.
- If ML-DSA has an unforeseen weakness, ECDSA still provides a safety net.

### `MlDsaSigner` in this repository

`modules/mpc/src/dsa.ts` exports a `MlDsaSigner` class that wraps the noble library with
an enterprise-friendly API:

```typescript
import { MlDsaSigner, ML_DSA_SIZES } from "./modules/mpc/src";

const signer = new MlDsaSigner();

// Key generation
const kp = signer.generateKeyPair("ml-dsa-65");
// kp.publicKey: Uint8Array (1952 B)
// kp.secretKey: Uint8Array (4032 B)

// Signing
const { signature, auditCommitment } = signer.sign(
  messageBytes,
  kp.secretKey,
  "ml-dsa-65",
);
// auditCommitment = SHA-256(signature hex) — safe to anchor on-chain

// Verification
const valid = signer.verify(messageBytes, signature, kp.publicKey, "ml-dsa-65");

// Audit record (hashes only — no secret material)
const record = signer.auditRecord(
  messageBytes,
  { signature, auditCommitment },
  kp.publicKey,
  "ml-dsa-65",
);
// record.verifiedAtAudit, record.signatureLength, record.messageHash, ...
```

`verify()` never throws on malformed input — it catches internally and returns `false`, preventing the function from being used as a timing oracle.

### Full-stack integration — the capstone example

`examples/quantum-safe-payment/index.ts` demonstrates ML-DSA working together with `HybridKem` and `MPCEngine` in a complete 4-phase payment lifecycle:

1. **Key ceremony** — both institutions generate and publish HSM-backed public keys
2. **Sign + encrypt** — payment instruction signed with ML-DSA-65, encrypted via Hybrid KEM + AES-256-GCM
3. **Decrypt + verify** — recipient recovers the session key and authenticates the signature
4. **Threshold authorization** — 3-of-3 settlement committee quorum via `MPCEngine`

```bash
npm run example:quantum-safe-payment
```

### Migration path for existing signing in adapters

Protocol integrations in `modules/integrations/` use ECDSA signatures for transaction endorsement (Fabric), Ethereum transaction signing (Besu via `ethers`), and REST auth tokens (Corda).

Migration steps:

1. Add ML-DSA-65 as a parallel signing lane alongside ECDSA today
2. Require both signatures to be present and valid during the transition window
3. When the Fabric endorsement policy and Besu tx format support native PQ signatures, retire the ECDSA lane

The `modules/mpc/src/dsa.ts` module is designed to slot into this migration path: it produces raw byte arrays that wire directly into any signing layer.
