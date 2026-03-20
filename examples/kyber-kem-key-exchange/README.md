# ML-KEM (Kyber) Key Exchange Example

## What this is

This example demonstrates **ML-KEM** — the post-quantum Key Encapsulation Mechanism standardised in NIST FIPS 203 (finalised August 2024) — applied to a realistic cross-border FX settlement scenario.

Leet Gaming Global Bank (Frankfurt) encrypts a €50M EUR/JPY settlement instruction and transmits it to Leet Gaming Settlement Corp (Tokyo) using ML-KEM instead of classical ECDH.

## Why ML-KEM instead of ECDH

Classical key exchange (ECDH, RSA) derives its security from the hardness of:

- **ECDH** → Elliptic Curve Discrete Logarithm Problem
- **RSA** → Integer Factorisation

**Shor's algorithm**, running on a cryptographically-relevant quantum computer (CRQC), solves both problems in polynomial time — making any traffic encrypted with these schemes breakable retroactively.

The threat coined **"harvest-now, decrypt-later"**: adversaries record encrypted traffic today and store it until CRQCs are powerful enough to decrypt it. For 30-year financial transaction records, the threat window matters now.

ML-KEM is based on the **Module Learning With Errors** (MLWE) lattice problem, which has no known quantum speedup beyond Grover's (which only halves the exponent of a brute-force search, leaving lattice-based security intact with appropriate parameter choices).

**Standard reference:** https://csrc.nist.gov/pubs/fips/203/final

## Parameter sets

| Parameter Set | NIST Level | Pub Key | Secret Key | Ciphertext | Post-Quantum Security         |
| ------------- | ---------- | ------- | ---------- | ---------- | ----------------------------- |
| ML-KEM-512    | Level 1    | 800 B   | 1 632 B    | 768 B      | ~128-bit (AES-128 equivalent) |
| ML-KEM-768    | Level 3    | 1 184 B | 2 400 B    | 1 088 B    | ~192-bit (AES-192 equivalent) |
| ML-KEM-1024   | Level 5    | 1 568 B | 3 168 B    | 1 568 B    | ~256-bit (AES-256 equivalent) |

NIST recommends **ML-KEM-768** for general enterprise use. ML-KEM-1024 is appropriate for data requiring confidentiality well beyond 2060 or with catastrophic breach consequences.

## Key exchange flow

```
Leet Gaming SC                            Leet Gaming
  |                                          |
  |-- keygen() ────────────────────────────> |  (publish public key)
  |                                          |
  |            encapsulate(publicKey) <───── |
  |            → ciphertext, sharedSecret    |
  |                                          |
  |            HKDF(sharedSecret) → aesKey   |
  |                                          |
  |            encrypt(settlement, aesKey)   |
  |                                          |
  | <──── ciphertext + encrypted payload ─── |
  |                                          |
  |-- decapsulate(ciphertext, secretKey)     |
  |   → same sharedSecret                   |
  |                                          |
  |-- HKDF(sharedSecret) → same aesKey      |
  |-- decrypt(encryptedPayload, aesKey) ✓   |
```

## What the example shows

1. **Leet Gaming SC** generates an ML-KEM keypair per parameter set
2. **Leet Gaming** encapsulates a fresh session key and derives AES-256-GCM key via HKDF
3. Settlement instruction (instruction ID, notional, value date, SWIFT ref, correspondent chain) encrypted and transmitted
4. **Leet Gaming SC** decapsulates → derives same AES-256-GCM key → decrypts and verifies
5. Audit commitment (sha256 of ciphertext) printed — suitable for on-chain anchoring
6. All three parameter sets shown with concrete byte counts
7. Wrong-key failure demonstrated: decap with wrong secret key yields mismatched shared secret (implicit rejection)

## Run

```bash
npm run example:kyber-kem
```

## Integration with the broader architecture

The `auditCommitment` from each `KemEncapsulation` is a SHA-256 hex digest of the ciphertext. In a production deployment this would be written to:

- A Hyperledger Fabric ledger (via the `FabricAdapter` in `modules/protocols/fabric`)
- A Besu private transaction (via `modules/protocols/besu`)
- Or a Corda vault update

This gives regulators a cryptographic proof that a specific key exchange occurred for a specific settlement, without revealing the shared secret or the decrypted payload.

See [docs/architecture/mpc-quantum-resistance.md](../../docs/architecture/mpc-quantum-resistance.md) for the full architecture context.
