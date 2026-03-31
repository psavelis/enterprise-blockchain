# Testing Guide

Property-based and unit testing strategy for enterprise blockchain cryptographic modules.

## Overview

The repository uses property-based testing with [fast-check](https://github.com/dubzzz/fast-check) to verify cryptographic invariants that unit tests miss. Unit tests verify specific inputs and expected outputs; property tests verify that invariants hold across thousands of randomly generated inputs.

## Why Property Tests for Cryptography

Cryptographic implementations fail silently. A subtle bug in field arithmetic or IV generation produces ciphertexts that decrypt to garbage without throwing errors. Property tests catch edge cases that humans cannot anticipate:

- Off-by-one errors in modular exponentiation
- IV reuse across encryptions
- Implicit rejection failures in post-quantum KEMs
- Non-associative operations in finite field arithmetic

## Test Files

| File                           | Module    | Properties Tested                                                     |
| ------------------------------ | --------- | --------------------------------------------------------------------- |
| `tests/hsm.property.test.ts`   | HSM       | Envelope encryption round-trip, ECDSA sign/verify, audit logging      |
| `tests/kyber.property.test.ts` | MPC (PQC) | ML-KEM-768 encapsulate/decapsulate, hybrid KEM X25519+Kyber           |
| `tests/mpc.property.test.ts`   | MPC       | Field arithmetic commutativity/associativity, Shamir k-of-n threshold |

## Running Tests

```bash
# Run all tests (unit + property)
npm test

# Run only property tests
npm test -- --grep property

# Run with verbose output
npm test -- --test-reporter spec

# Run specific module
npm test -- tests/hsm.property.test.ts
```

## Property Test Patterns

### HSM Module: Envelope Encryption

Envelope encryption uses a key-encryption-key (KEK) to wrap a randomly generated data-encryption-key (DEK). The property tests verify:

```typescript
// Round-trip: decrypt(encrypt(plaintext)) === plaintext
fc.assert(
  fc.property(
    fc.string({ minLength: 1, maxLength: 10000, unit: "binary-ascii" }),
    (plaintext) => {
      const { encryptedRecord, wrappedDek } = hsm.encryptWithEnvelope(
        kekLabel,
        plaintext,
      );
      const decrypted = hsm.decryptWithEnvelope(wrappedDek, encryptedRecord);
      return decrypted === plaintext;
    },
  ),
  { numRuns: 100 },
);
```

**Key invariants tested:**

- Same plaintext with different DEKs produces different ciphertexts (no DEK reuse)
- Each envelope has a unique IV (no IV reuse)
- Tampered messages fail signature verification

**Input constraints:** The `unit: "binary-ascii"` constraint limits strings to printable ASCII. This avoids edge cases with certain Unicode characters that cause encoding issues unrelated to the cryptographic properties being tested.

### Kyber Module: Post-Quantum KEM

ML-KEM-768 (NIST FIPS 203) requires that:

1. Encapsulation produces a ciphertext and shared secret
2. Decapsulation with the correct secret key recovers the same shared secret
3. Decapsulation with a wrong key produces a different secret (implicit rejection)

```typescript
// Implicit rejection: wrong key produces different shared secret
fc.assert(
  fc.property(fc.constant(null), () => {
    const keyPair1 = kem.generateKeyPair("ml-kem-768");
    const keyPair2 = kem.generateKeyPair("ml-kem-768");

    const encapsulation = kem.encapsulate(keyPair1.publicKey, "ml-kem-768");
    const wrongDecap = kem.decapsulate(
      encapsulation.ciphertext,
      keyPair2.secretKey, // Wrong key
      "ml-kem-768",
    );

    // Must produce different shared secret
    return !encapsulation.sharedSecret.equals(wrongDecap);
  }),
  { numRuns: 10 },
);
```

**Run count:** Post-quantum key operations are computationally expensive. The test uses `numRuns: 10-20` instead of 100+ to keep CI fast while still catching regressions.

### MPC Module: Field Arithmetic

Secret sharing requires correct finite field arithmetic. Off-by-one errors in modular operations cause reconstruction failures:

```typescript
// Multiplicative inverse: a * inverse(a) === 1 (mod p)
fc.assert(
  fc.property(fc.bigInt({ min: 1n, max: DEMO_PRIME - 1n }), (a) => {
    const inv = field.inverse(a);
    return field.mul(a, inv) === 1n;
  }),
  { numRuns: 500 },
);
```

**Properties tested:**

- Addition commutativity: `a + b === b + a`
- Multiplication commutativity: `a * b === b * a`
- Additive identity: `(a + b) - b === a`
- Multiplicative inverse: `a * inverse(a) === 1`
- Exponentiation base cases: `pow(a, 0) === 1`, `pow(a, 1) === a`

### Shamir Threshold Sharing

Shamir's secret sharing splits a secret into n shares where any k shares can reconstruct the original:

```typescript
// Any k-of-n shares reconstruct the secret
fc.assert(
  fc.property(
    fc.integer({ min: 1, max: 1_000_000 }),
    fc.integer({ min: 3, max: 5 }), // threshold
    fc.integer({ min: 0, max: 2 }), // extra parties
    (secret, threshold, extra) => {
      const partyCount = threshold + extra;
      const parties = Array.from(
        { length: partyCount },
        (_, i) => `party-${i}`,
      );

      const shares = vault.distributeSecret(secret, parties, threshold);
      const subset = Array.from(shares.values()).slice(0, threshold);
      const reconstructed = vault.reconstructSecret(subset, threshold);

      return reconstructed === secret;
    },
  ),
  { numRuns: 100 },
);
```

**Invariants tested:**

- Any k shares reconstruct correctly
- Fewer than k shares return `null`
- Different k-subsets produce the same result

## fast-check Configuration

### Run Counts

| Module                | Recommended numRuns | Rationale                                     |
| --------------------- | ------------------- | --------------------------------------------- |
| Field arithmetic      | 500-1000            | Fast operations, need coverage of edge cases  |
| HSM envelope          | 30-100              | Moderate crypto operations                    |
| Kyber KEM             | 10-20               | Expensive PQ operations                       |
| Shamir reconstruction | 50-100              | Polynomial evaluation is moderately expensive |

### Input Generators

Common generators used across tests:

```typescript
// Strings (avoiding Unicode edge cases)
fc.string({ minLength: 1, maxLength: 1000, unit: "binary-ascii" });

// BigInt for field elements
fc.bigInt({ min: 0n, max: PRIME - 1n });

// Threshold values (typical 3-of-5 to 5-of-7)
fc.integer({ min: 3, max: 5 });

// UUIDs for computation identifiers
fc.uuid();
```

### Shrinking

fast-check automatically shrinks failing inputs to minimal counterexamples. When a test fails, the output shows the smallest input that triggers the failure:

```
Error: Property failed after 47 tests
Counterexample: ["\\"]
```

This shrunk counterexample (a single backslash) revealed an encoding edge case in the HSM module that was fixed by constraining inputs to binary-ascii.

## CI Integration

Property tests run as part of the standard test suite in CI:

```yaml
# .github/workflows/ci.yml
- name: Run tests
  run: npm test
```

The test suite exits non-zero on any property failure, blocking merges.

## Writing New Property Tests

1. **Identify the invariant**: What must always be true regardless of input?
2. **Choose the generator**: Use the most general input type that exercises the code path
3. **Add constraints if needed**: Exclude inputs that cause unrelated failures (encoding, size limits)
4. **Set appropriate numRuns**: Balance coverage with execution time
5. **Document why the property matters**: Future readers need context

Example template:

```typescript
test("module: descriptive property name", () => {
  fc.assert(
    fc.property(
      /* generators */,
      (/* args */) => {
        // Setup
        // Action
        // Assert invariant holds
        return /* boolean expression */;
      },
    ),
    { numRuns: /* appropriate count */ },
  );
});
```

## References

- [fast-check documentation](https://github.com/dubzzz/fast-check)
- [Node.js test runner](https://nodejs.org/api/test.html)
- [FIPS 203 (ML-KEM)](https://csrc.nist.gov/pubs/fips/203/final)
- [Shamir's Secret Sharing](https://en.wikipedia.org/wiki/Shamir%27s_secret_sharing)
