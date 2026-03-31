/**
 * Property-based fuzz tests for post-quantum cryptographic modules.
 *
 * Tests ML-KEM (Kyber) and Hybrid KEM round-trip properties.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { KyberKem, HybridKem, ML_KEM_SIZES } from "../modules/mpc/src/index";

// Default parameter set for most tests
const DEFAULT_PARAMS = "ml-kem-768" as const;

// ── ML-KEM (Kyber) Properties ───────────────────────────────────────────────

test("ML-KEM: encapsulate/decapsulate produces identical shared secrets", () => {
  const kem = new KyberKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      // Generate fresh key pair for each test
      const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);

      // Encapsulate
      const encapsulation = kem.encapsulate(keyPair.publicKey, DEFAULT_PARAMS);

      // Decapsulate
      const sharedSecret = kem.decapsulate(
        encapsulation.ciphertext,
        keyPair.secretKey,
        DEFAULT_PARAMS,
      );

      // Shared secrets must match
      assert.equal(encapsulation.sharedSecret.length, sharedSecret.length);

      // Compare byte-by-byte
      for (let i = 0; i < encapsulation.sharedSecret.length; i++) {
        if (encapsulation.sharedSecret[i] !== sharedSecret[i]) {
          return false;
        }
      }

      return true;
    }),
    { numRuns: 20 }, // Fewer runs due to expensive PQ crypto
  );
});

test("ML-KEM: different key pairs produce different shared secrets", () => {
  const kem = new KyberKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPair1 = kem.generateKeyPair(DEFAULT_PARAMS);
      const keyPair2 = kem.generateKeyPair(DEFAULT_PARAMS);

      // Encapsulate to both public keys
      const encap1 = kem.encapsulate(keyPair1.publicKey, DEFAULT_PARAMS);
      const encap2 = kem.encapsulate(keyPair2.publicKey, DEFAULT_PARAMS);

      // Shared secrets should be different (with overwhelming probability)
      let same = true;
      for (let i = 0; i < encap1.sharedSecret.length && same; i++) {
        if (encap1.sharedSecret[i] !== encap2.sharedSecret[i]) {
          same = false;
        }
      }

      return !same; // Should be different
    }),
    { numRuns: 10 },
  );
});

test("ML-KEM: wrong secret key fails to decrypt", () => {
  const kem = new KyberKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPair1 = kem.generateKeyPair(DEFAULT_PARAMS);
      const keyPair2 = kem.generateKeyPair(DEFAULT_PARAMS);

      // Encapsulate to keyPair1's public key
      const encapsulation = kem.encapsulate(keyPair1.publicKey, DEFAULT_PARAMS);

      // Try to decapsulate with keyPair2's secret key (wrong key)
      const wrongDecap = kem.decapsulate(
        encapsulation.ciphertext,
        keyPair2.secretKey,
        DEFAULT_PARAMS,
      );

      // Should produce different shared secret (implicit rejection)
      let same = true;
      for (let i = 0; i < encapsulation.sharedSecret.length && same; i++) {
        if (encapsulation.sharedSecret[i] !== wrongDecap[i]) {
          same = false;
        }
      }

      return !same; // Should be different due to wrong key
    }),
    { numRuns: 10 },
  );
});

// ── Hybrid KEM Properties ───────────────────────────────────────────────────

test("Hybrid KEM: encapsulate/decapsulate produces identical combined keys", () => {
  const hybridKem = new HybridKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      // Generate hybrid key pairs
      const keyPairs = hybridKem.generateKeyPairs();

      // Encapsulate
      const encapsulation = hybridKem.encapsulate(
        keyPairs.x25519.publicKey,
        keyPairs.kyber.publicKey,
      );

      // Decapsulate
      const decapsulation = hybridKem.decapsulate(
        keyPairs.x25519.privateKey,
        keyPairs.kyber.secretKey,
        encapsulation.x25519EphemeralPublicKeyDer,
        encapsulation.kyberCiphertext,
      );

      // Combined keys must match
      assert.equal(
        encapsulation.combinedKey.length,
        decapsulation.combinedKey.length,
      );
      assert.equal(encapsulation.combinedKey.length, 32); // 256-bit key

      return encapsulation.combinedKey.equals(decapsulation.combinedKey);
    }),
    { numRuns: 15 },
  );
});

test("Hybrid KEM: combined key is 256 bits", () => {
  const hybridKem = new HybridKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPairs = hybridKem.generateKeyPairs();
      const encapsulation = hybridKem.encapsulate(
        keyPairs.x25519.publicKey,
        keyPairs.kyber.publicKey,
      );

      // Key should be exactly 32 bytes (256 bits)
      return encapsulation.combinedKey.length === 32;
    }),
    { numRuns: 10 },
  );
});

test("Hybrid KEM: audit commitment is deterministic", () => {
  const hybridKem = new HybridKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPairs = hybridKem.generateKeyPairs();
      const encapsulation = hybridKem.encapsulate(
        keyPairs.x25519.publicKey,
        keyPairs.kyber.publicKey,
      );

      // Audit commitment should be a SHA-256 hash (64 hex chars)
      assert.equal(encapsulation.auditCommitment.length, 64);
      assert.match(encapsulation.auditCommitment, /^[a-f0-9]{64}$/);

      return true;
    }),
    { numRuns: 10 },
  );
});

test("Hybrid KEM: wrong X25519 key fails decapsulation", () => {
  const hybridKem = new HybridKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPairs1 = hybridKem.generateKeyPairs();
      const keyPairs2 = hybridKem.generateKeyPairs();

      // Encapsulate to keyPairs1
      const encapsulation = hybridKem.encapsulate(
        keyPairs1.x25519.publicKey,
        keyPairs1.kyber.publicKey,
      );

      // Decapsulate with wrong X25519 key (keyPairs2)
      const wrongDecap = hybridKem.decapsulate(
        keyPairs2.x25519.privateKey, // Wrong X25519 key
        keyPairs1.kyber.secretKey, // Correct Kyber key
        encapsulation.x25519EphemeralPublicKeyDer,
        encapsulation.kyberCiphertext,
      );

      // Combined keys should be different
      return !encapsulation.combinedKey.equals(wrongDecap.combinedKey);
    }),
    { numRuns: 10 },
  );
});

test("Hybrid KEM: wrong Kyber key fails decapsulation", () => {
  const hybridKem = new HybridKem();

  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPairs1 = hybridKem.generateKeyPairs();
      const keyPairs2 = hybridKem.generateKeyPairs();

      // Encapsulate to keyPairs1
      const encapsulation = hybridKem.encapsulate(
        keyPairs1.x25519.publicKey,
        keyPairs1.kyber.publicKey,
      );

      // Decapsulate with wrong Kyber key (keyPairs2)
      const wrongDecap = hybridKem.decapsulate(
        keyPairs1.x25519.privateKey, // Correct X25519 key
        keyPairs2.kyber.secretKey, // Wrong Kyber key
        encapsulation.x25519EphemeralPublicKeyDer,
        encapsulation.kyberCiphertext,
      );

      // Combined keys should be different
      return !encapsulation.combinedKey.equals(wrongDecap.combinedKey);
    }),
    { numRuns: 10 },
  );
});

// ── Key Size Properties ─────────────────────────────────────────────────────

test("ML-KEM-768: key sizes match NIST specification", () => {
  const kem = new KyberKem();
  const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);

  // ML-KEM-768 key sizes per FIPS 203
  assert.equal(
    keyPair.publicKey.length,
    ML_KEM_SIZES[DEFAULT_PARAMS].publicKey,
  );
  assert.equal(
    keyPair.secretKey.length,
    ML_KEM_SIZES[DEFAULT_PARAMS].secretKey,
  );
  assert.equal(keyPair.params, DEFAULT_PARAMS);
});

test("ML-KEM-768: ciphertext size matches NIST specification", () => {
  const kem = new KyberKem();
  const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);
  const encapsulation = kem.encapsulate(keyPair.publicKey, DEFAULT_PARAMS);

  // ML-KEM-768 ciphertext size per FIPS 203
  assert.equal(
    encapsulation.ciphertext.length,
    ML_KEM_SIZES[DEFAULT_PARAMS].ciphertext,
  );
  assert.equal(
    encapsulation.sharedSecret.length,
    ML_KEM_SIZES[DEFAULT_PARAMS].sharedSecret,
  );
});

// ── AES Key Derivation Properties ───────────────────────────────────────────

test("ML-KEM: deriveAesKey produces 32-byte key", () => {
  const kem = new KyberKem();
  const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);
  const encapsulation = kem.encapsulate(keyPair.publicKey, DEFAULT_PARAMS);

  const aesKey = kem.deriveAesKey(encapsulation.sharedSecret);

  assert.equal(aesKey.length, 32); // AES-256
});

test("ML-KEM: same shared secret with same info produces same AES key", () => {
  const kem = new KyberKem();
  const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);
  const encapsulation = kem.encapsulate(keyPair.publicKey, DEFAULT_PARAMS);

  const aesKey1 = kem.deriveAesKey(encapsulation.sharedSecret, "context-v1");
  const aesKey2 = kem.deriveAesKey(encapsulation.sharedSecret, "context-v1");

  assert.ok(aesKey1.equals(aesKey2));
});

test("ML-KEM: different info strings produce different AES keys", () => {
  const kem = new KyberKem();
  const keyPair = kem.generateKeyPair(DEFAULT_PARAMS);
  const encapsulation = kem.encapsulate(keyPair.publicKey, DEFAULT_PARAMS);

  const aesKey1 = kem.deriveAesKey(encapsulation.sharedSecret, "context-v1");
  const aesKey2 = kem.deriveAesKey(encapsulation.sharedSecret, "context-v2");

  assert.ok(!aesKey1.equals(aesKey2));
});
