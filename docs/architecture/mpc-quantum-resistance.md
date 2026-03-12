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
