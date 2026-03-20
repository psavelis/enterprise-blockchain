# Quantum-Safe Payment Authorization — Full Stack

**This is the capstone example.** Every NIST post-quantum primitive in this repository, wired together in a single, end-to-end, enterprise payment lifecycle — one command.

```bash
npm run example:quantum-safe-payment
```

---

## Scenario

**Leet Gaming Global Bank AG** (MRGBDEFF, Frankfurt) sends a €50,000,000 EUR/JPY FX settlement instruction to **Leet Gaming Settlement Corp** (NOVAJPJT, Tokyo) through a four-phase quantum-safe lifecycle.

**Instruction ID:** `MGB-NPY-2026-03-20-QSAF-001`  
**Correspondent chain:** MRGBDEFF → DEUTDEDB → BOTKJPJT → NOVAJPJT

---

## Primitives in Use

| Layer              | Primitive               | Standard        | Parameter set |
| ------------------ | ----------------------- | --------------- | ------------- |
| Digital signature  | **ML-DSA**              | NIST FIPS 204   | ML-DSA-65     |
| Key encapsulation  | **ML-KEM (Hybrid KEM)** | NIST FIPS 203   | ML-KEM-768    |
| Classical fallback | **X25519**              | RFC 7748        | —             |
| Symmetric cipher   | **AES-256-GCM**         | NIST SP 800-38D | 256-bit key   |
| Authorization      | **Additive MPC**        | —               | 3-of-3        |

---

## Phase 1 — Key Ceremony

Both institutions generate and publish quantum-safe public keys:

- **Leet Gaming** generates an ML-DSA-65 signing keypair (FIPS 204, Level 3)
  - Public key: **1,952 bytes**
  - Used to sign every settlement instruction
- **Leet Gaming SC** generates a Hybrid KEM keypair:
  - X25519 public key: **32 bytes** (classical fallback)
  - ML-KEM-768 public key: **1,184 bytes** (post-quantum channel)
- Both public keys are anchored via SHA-256 to a simulated consortium ledger

---

## Phase 2 — Leet Gaming Signs and Encrypts

1. Build the `SettlementInstruction` JSON (amounts, rates, SWIFT refs, BIC codes)
2. **Sign** with ML-DSA-65 → 3,309-byte signature + audit commitment
3. **Encapsulate** a session key via Hybrid KEM:
   - X25519 ECDH → classical component
   - ML-KEM-768 encapsulation → post-quantum component
   - `combinedKey = HKDF-SHA256( x25519_secret ∥ kyber_secret, "hybrid-kem-v1" )`
4. **Derive** an AES key via HKDF with domain separator `"quantum-safe-payment-v1:{instructionId}"`
5. **AES-256-GCM encrypt** the `{ instruction + signature }` bundle

---

## Phase 3 — Leet Gaming SC Decrypts and Verifies

1. **Decapsulate** via Hybrid KEM → recover `combinedKey` → rederive AES key
2. **AES-256-GCM decrypt** the bundle (auth tag verified — tampering impossible)
3. **Verify** the ML-DSA-65 signature against Leet Gaming's published public key
4. Print: `✓ Instruction authenticated — ML-DSA-65 (FIPS 204)`

---

## Phase 4 — Settlement Committee Authorization (3-of-3)

Before funds move, three Leet Gaming SC officers submit additive secret shares of the settlement authorization code:

| Officer   | Role            |
| --------- | --------------- |
| Officer A | Settlement Head |
| Officer B | Risk Officer    |
| Officer C | Compliance Lead |

`MPCEngine.splitSecret()` produces 3 independent shares (additive — any 2 reveal nothing).  
Reconstruction requires all 3.  
Print: `✓ Settlement authorized — 3/3 threshold met`

---

## Security Properties Demo

Four attack scenarios are exercised to confirm the system rejects them:

| #   | Attack                               | Layer that catches it              |
| --- | ------------------------------------ | ---------------------------------- |
| 1   | Tampered ciphertext                  | AES-GCM auth tag mismatch          |
| 2   | Valid ciphertext, tampered signature | ML-DSA verify returns `false`      |
| 3   | Wrong Hybrid KEM private key         | Different `combinedKey` → GCM fail |
| 4   | Only 2-of-3 authorization shares     | Reconstructed code ≠ original      |

---

## Expected Output (abbreviated)

```
=================================================================
  Quantum-Safe Payment Authorization — Full Stack
  Leet Gaming Global Bank AG  →  Leet Gaming Settlement Corp
  Instruction: MGB-NPY-2026-03-20-QSAF-001
  Notional:    €50,000,000 EUR/JPY @ 162.34
=================================================================

  Phase 1: Key Ceremony
  [Leet Gaming] ML-DSA-65 signing keypair generated
             Public key : 1952 bytes
             Secret key : 4032 bytes
  [Leet Gaming SC]  Hybrid KEM keypair generated
             ML-KEM-768 pub key : 1184 bytes

  Phase 2: Leet Gaming Signs and Encrypts
  [Leet Gaming] Instruction signed with ML-DSA-65
             Signature size  : 3309 bytes
  [Leet Gaming] Hybrid KEM encapsulation
             ML-KEM-768 ciphertext : 1088 bytes
             Combined key (HKDF)   : 32 bytes (not transmitted)

  Phase 3: Leet Gaming SC Decrypts and Verifies
  Combined keys match : true  ✓
  Payload integrity   : true  ✓
  ML-DSA-65 signature : true  ✓

  ✓ Instruction authenticated — ML-DSA-65 (FIPS 204)

  Phase 4: Settlement Committee Authorization (3-of-3)
  ✓ Settlement authorized — 3/3 threshold met

  Security Properties — Attack Scenarios
  Scenario 1: Tampered ciphertext          → ✓ fail — Unsupported state
  Scenario 2: Tampered signature           → ✓ false (correctly rejected)
  Scenario 3: Wrong KEM keys               → ✓ fail — Unsupported state
  Scenario 4: Only 2 shares submitted      → ✓ (correctly unauthorized)

  Summary
  ✓ Phase 1  Key ceremony complete
  ✓ Phase 2  Instruction signed + encrypted
  ✓ Phase 3  Decrypted and authenticated — ML-DSA-65 signature valid
  ✓ Phase 4  Settlement authorized — 3/3 officer quorum met
  ✓ All 4 security property tests passed
```

---

## Standards

- [NIST FIPS 203 (ML-KEM)](https://csrc.nist.gov/pubs/fips/203/final) — Key Encapsulation
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final) — Digital Signatures
- [RFC 5869 (HKDF)](https://datatracker.ietf.org/doc/html/rfc5869) — Key Derivation
- [NIST SP 800-38D (AES-GCM)](https://csrc.nist.gov/publications/detail/sp/800-38d/final) — Authenticated Encryption

## Related Examples

| Command                               | What it demonstrates                     |
| ------------------------------------- | ---------------------------------------- |
| `npm run example:kyber-kem`           | Pure ML-KEM, all 3 param sets            |
| `npm run example:hybrid-kem`          | X25519 + ML-KEM-768, break-both property |
| `npm run example:quantum-key-sharing` | Shamir 3-of-5 threshold key custody      |
| `npm run example:hsm-key-ceremony`    | Multi-party HSM ceremony + PQC envelopes |
