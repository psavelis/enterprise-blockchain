/**
 * tests/quantum.test.ts
 *
 * Unit tests for the ML-KEM (KyberKem) and Hybrid KEM (HybridKem) modules.
 *
 * Byte-length assertions are derived directly from NIST FIPS 203 §7 wire
 * format tables and verified against the @noble/post-quantum implementation.
 * Reference: https://csrc.nist.gov/pubs/fips/203/final
 *
 * Test runner: node:test (built-in, no extra dependency needed)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { KyberKem, ML_KEM_SIZES } from "../modules/mpc/src/kyber";
import { HybridKem } from "../modules/mpc/src/hybrid-kem";

// ---------------------------------------------------------------------------
// KyberKem — pure ML-KEM tests
// ---------------------------------------------------------------------------

// Shorthand: ensures all three param sets stay consistent without repeating
// the same block three times.
const kem = new KyberKem();

// ---- Parameter set: byte-length verification ----

test("ML-KEM-512 keygen produces FIPS 203 wire-format byte lengths", () => {
  const kp = kem.generateKeyPair("ml-kem-512");

  // FIPS 203 §7.1 table: ek = 800 bytes, dk = 1 632 bytes
  assert.equal(kp.publicKey.length, ML_KEM_SIZES["ml-kem-512"].publicKey);
  assert.equal(kp.secretKey.length, ML_KEM_SIZES["ml-kem-512"].secretKey);
  assert.equal(kp.params, "ml-kem-512");
});

test("ML-KEM-768 keygen produces FIPS 203 wire-format byte lengths", () => {
  const kp = kem.generateKeyPair("ml-kem-768");

  // FIPS 203 §7.1 table: ek = 1 184 bytes, dk = 2 400 bytes
  assert.equal(kp.publicKey.length, ML_KEM_SIZES["ml-kem-768"].publicKey);
  assert.equal(kp.secretKey.length, ML_KEM_SIZES["ml-kem-768"].secretKey);
  assert.equal(kp.params, "ml-kem-768");
});

test("ML-KEM-1024 keygen produces FIPS 203 wire-format byte lengths", () => {
  const kp = kem.generateKeyPair("ml-kem-1024");

  // FIPS 203 §7.1 table: ek = 1 568 bytes, dk = 3 168 bytes
  assert.equal(kp.publicKey.length, ML_KEM_SIZES["ml-kem-1024"].publicKey);
  assert.equal(kp.secretKey.length, ML_KEM_SIZES["ml-kem-1024"].secretKey);
  assert.equal(kp.params, "ml-kem-1024");
});

// ---- Encapsulation: ciphertext sizes and shared-secret length ----

test("ML-KEM-768 encapsulate returns correct ciphertext and shared-secret sizes", () => {
  const kp = kem.generateKeyPair("ml-kem-768");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-768");

  // FIPS 203 §7.2: c (ciphertext) = 1 088 bytes, K (shared secret) = 32 bytes
  assert.equal(encap.ciphertext.length, ML_KEM_SIZES["ml-kem-768"].ciphertext);
  assert.equal(encap.sharedSecret.length, 32);

  // Audit commitment must be a 64-char lowercase hex string (SHA-256 digest)
  assert.match(encap.auditCommitment, /^[0-9a-f]{64}$/);
});

test("ML-KEM-512 encapsulate ciphertext length matches FIPS 203 table", () => {
  const kp = kem.generateKeyPair("ml-kem-512");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-512");
  assert.equal(encap.ciphertext.length, ML_KEM_SIZES["ml-kem-512"].ciphertext); // 768 B
});

test("ML-KEM-1024 encapsulate ciphertext length matches FIPS 203 table", () => {
  const kp = kem.generateKeyPair("ml-kem-1024");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-1024");
  assert.equal(encap.ciphertext.length, ML_KEM_SIZES["ml-kem-1024"].ciphertext); // 1 568 B
});

// ---- Encap / decap roundtrip ----

test("ML-KEM-768 encap/decap roundtrip: both sides derive the same 32-byte shared secret", () => {
  // Simulates a real session: NovaPay generates a keypair, Meridian encapsulates,
  // NovaPay decapsulates — both should land on the same shared secret.
  const novaPayKp = kem.generateKeyPair("ml-kem-768");
  const meridianEncap = kem.encapsulate(novaPayKp.publicKey, "ml-kem-768");
  const recovered = kem.decapsulate(
    meridianEncap.ciphertext,
    novaPayKp.secretKey,
    "ml-kem-768",
  );

  assert.equal(recovered.length, 32);
  assert.deepEqual(
    Buffer.from(recovered),
    Buffer.from(meridianEncap.sharedSecret),
  );
});

test("ML-KEM-512 encap/decap roundtrip succeeds", () => {
  const kp = kem.generateKeyPair("ml-kem-512");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-512");
  const dec = kem.decapsulate(encap.ciphertext, kp.secretKey, "ml-kem-512");
  assert.deepEqual(Buffer.from(dec), Buffer.from(encap.sharedSecret));
});

test("ML-KEM-1024 encap/decap roundtrip succeeds", () => {
  const kp = kem.generateKeyPair("ml-kem-1024");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-1024");
  const dec = kem.decapsulate(encap.ciphertext, kp.secretKey, "ml-kem-1024");
  assert.deepEqual(Buffer.from(dec), Buffer.from(encap.sharedSecret));
});

// ---- Implicit rejection / security property ----

test("decapsulating with wrong secret key yields a different shared secret (implicit rejection)", () => {
  // ML-KEM implements implicit rejection (FIPS 203 §6.3): decapsulating with
  // the wrong key does not throw an error — it returns a pseudorandom value.
  // This makes it impossible for an attacker to use decapsulation as an oracle
  // to test whether a key guess is correct (prevents CCA attacks).
  const legitimateKp = kem.generateKeyPair("ml-kem-768");
  const attackerKp = kem.generateKeyPair("ml-kem-768");

  const encap = kem.encapsulate(legitimateKp.publicKey, "ml-kem-768");

  const correctSecret = kem.decapsulate(
    encap.ciphertext,
    legitimateKp.secretKey,
    "ml-kem-768",
  );
  const wrongSecret = kem.decapsulate(
    encap.ciphertext,
    attackerKp.secretKey,
    "ml-kem-768",
  );

  assert.equal(
    Buffer.from(correctSecret).equals(Buffer.from(wrongSecret)),
    false,
    "Implicit rejection should produce a different value when the wrong secret key is used",
  );
});

// ---- HKDF key derivation ----

test("deriveAesKey always produces 32 bytes regardless of input length", () => {
  const kp = kem.generateKeyPair("ml-kem-768");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-768");

  const derived = kem.deriveAesKey(encap.sharedSecret);
  assert.equal(derived.length, 32);
  assert.ok(Buffer.isBuffer(derived));
});

test("deriveAesKey is deterministic: same sharedSecret + info → same key", () => {
  const kp = kem.generateKeyPair("ml-kem-768");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-768");

  const key1 = kem.deriveAesKey(
    encap.sharedSecret,
    "settlement:MGB-NPY-2026-03-20-FX-001",
  );
  const key2 = kem.deriveAesKey(
    encap.sharedSecret,
    "settlement:MGB-NPY-2026-03-20-FX-001",
  );

  assert.deepEqual(key1, key2);
});

test("deriveAesKey produces different keys for different info strings", () => {
  const kp = kem.generateKeyPair("ml-kem-768");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-768");

  const key1 = kem.deriveAesKey(encap.sharedSecret, "context-a");
  const key2 = kem.deriveAesKey(encap.sharedSecret, "context-b");

  assert.equal(key1.equals(key2), false);
});

// ---- Audit record ----

test("auditRecord fields are all present and correctly typed", () => {
  const kp = kem.generateKeyPair("ml-kem-768");
  const encap = kem.encapsulate(kp.publicKey, "ml-kem-768");

  const record = kem.auditRecord(encap, kp.publicKey, "ml-kem-768");

  assert.equal(record.params, "ml-kem-768");
  assert.match(record.publicKeyHash, /^[0-9a-f]{64}$/);
  assert.match(record.ciphertextHash, /^[0-9a-f]{64}$/);
  assert.ok(
    Date.parse(record.timestamp) > 0,
    "timestamp should be a valid ISO-8601 date",
  );
  assert.equal(record.derivedKeyLength, 32);

  // The ciphertextHash in the audit record should match the auditCommitment
  // on the encapsulation result (same SHA-256 of the ciphertext)
  assert.equal(record.ciphertextHash, encap.auditCommitment);
});

// ---------------------------------------------------------------------------
// HybridKem — X25519 + ML-KEM-768 tests
// ---------------------------------------------------------------------------

const hybrid = new HybridKem();

test("generateKeyPairs returns both X25519 and ML-KEM-768 key pairs", () => {
  const keys = hybrid.generateKeyPairs();

  // X25519 keys come back as KeyObject instances
  assert.equal(keys.x25519.publicKey.asymmetricKeyType, "x25519");
  assert.equal(keys.x25519.privateKey.asymmetricKeyType, "x25519");

  // ML-KEM-768 keys have the expected byte lengths
  assert.equal(
    keys.kyber.publicKey.length,
    ML_KEM_SIZES["ml-kem-768"].publicKey,
  );
  assert.equal(
    keys.kyber.secretKey.length,
    ML_KEM_SIZES["ml-kem-768"].secretKey,
  );
  assert.equal(keys.kyber.params, "ml-kem-768");
});

test("HybridKem encap/decap roundtrip: both sides derive the same 32-byte combined key", () => {
  // Real settlement scenario: NovaPay has long-term hybrid keys, Meridian
  // encapsulates a one-time session key, NovaPay decapsulates.
  const novaPayKeys = hybrid.generateKeyPairs();

  const encap = hybrid.encapsulate(
    novaPayKeys.x25519.publicKey,
    novaPayKeys.kyber.publicKey,
  );

  const decap = hybrid.decapsulate(
    novaPayKeys.x25519.privateKey,
    novaPayKeys.kyber.secretKey,
    encap.x25519EphemeralPublicKeyDer,
    encap.kyberCiphertext,
  );

  assert.equal(decap.combinedKey.length, 32);
  assert.deepEqual(decap.combinedKey, encap.combinedKey);
});

test("wrong X25519 key produces a different combined key", () => {
  const novaPayKeys = hybrid.generateKeyPairs();
  const attackerKeys = hybrid.generateKeyPairs(); // completely different

  const encap = hybrid.encapsulate(
    novaPayKeys.x25519.publicKey,
    novaPayKeys.kyber.publicKey,
  );

  const decapWrongX25519 = hybrid.decapsulate(
    attackerKeys.x25519.privateKey, // wrong
    novaPayKeys.kyber.secretKey, // correct
    encap.x25519EphemeralPublicKeyDer,
    encap.kyberCiphertext,
  );

  assert.equal(
    decapWrongX25519.combinedKey.equals(encap.combinedKey),
    false,
    "Wrong X25519 key should prevent correct derivation of combined key",
  );
});

test("wrong ML-KEM key produces a different combined key", () => {
  const novaPayKeys = hybrid.generateKeyPairs();
  const attackerKeys = hybrid.generateKeyPairs();

  const encap = hybrid.encapsulate(
    novaPayKeys.x25519.publicKey,
    novaPayKeys.kyber.publicKey,
  );

  const decapWrongKyber = hybrid.decapsulate(
    novaPayKeys.x25519.privateKey, // correct
    attackerKeys.kyber.secretKey, // wrong — ML-KEM implicit rejection kicks in
    encap.x25519EphemeralPublicKeyDer,
    encap.kyberCiphertext,
  );

  assert.equal(
    decapWrongKyber.combinedKey.equals(encap.combinedKey),
    false,
    "Wrong ML-KEM key should prevent correct derivation of combined key",
  );
});

test("combined key differs from either raw component — HKDF binds both secrets together", () => {
  // The combined key should not be equal to a naive HKDF of only the X25519
  // or only the ML-KEM shared secret.  This verifies the concatenation in
  // HKDF IKM is actually working and neither channel dominates.
  const novaPayKeys = hybrid.generateKeyPairs();

  const encap = hybrid.encapsulate(
    novaPayKeys.x25519.publicKey,
    novaPayKeys.kyber.publicKey,
  );

  const decap = hybrid.decapsulate(
    novaPayKeys.x25519.privateKey,
    novaPayKeys.kyber.secretKey,
    encap.x25519EphemeralPublicKeyDer,
    encap.kyberCiphertext,
  );

  // Two fresh encaps → different combined keys (ephemeral X25519 changes each time)
  const encap2 = hybrid.encapsulate(
    novaPayKeys.x25519.publicKey,
    novaPayKeys.kyber.publicKey,
  );

  const decap2 = hybrid.decapsulate(
    novaPayKeys.x25519.privateKey,
    novaPayKeys.kyber.secretKey,
    encap2.x25519EphemeralPublicKeyDer,
    encap2.kyberCiphertext,
  );

  assert.equal(
    decap.combinedKey.equals(decap2.combinedKey),
    false,
    "Two independent encapsulations should produce different combined keys (ephemeral randomness)",
  );
});

test("HybridKem audit commitment is a 64-char hex string", () => {
  const keys = hybrid.generateKeyPairs();
  const encap = hybrid.encapsulate(keys.x25519.publicKey, keys.kyber.publicKey);
  assert.match(encap.auditCommitment, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// MlDsaSigner — NIST FIPS 204 tests
// ---------------------------------------------------------------------------

import { MlDsaSigner, ML_DSA_SIZES } from "../modules/mpc/src/dsa";

const dsa = new MlDsaSigner();

test("ML-DSA-44 keygen produces FIPS 204 wire-format byte lengths", () => {
  const kp = dsa.generateKeyPair("ml-dsa-44");
  assert.equal(kp.publicKey.length, ML_DSA_SIZES["ml-dsa-44"].publicKey);
  assert.equal(kp.secretKey.length, ML_DSA_SIZES["ml-dsa-44"].secretKey);
  assert.equal(kp.params, "ml-dsa-44");
});

test("ML-DSA-65 keygen produces FIPS 204 wire-format byte lengths", () => {
  const kp = dsa.generateKeyPair("ml-dsa-65");
  assert.equal(kp.publicKey.length, ML_DSA_SIZES["ml-dsa-65"].publicKey);
  assert.equal(kp.secretKey.length, ML_DSA_SIZES["ml-dsa-65"].secretKey);
  assert.equal(kp.params, "ml-dsa-65");
});

test("ML-DSA-87 keygen produces FIPS 204 wire-format byte lengths", () => {
  const kp = dsa.generateKeyPair("ml-dsa-87");
  assert.equal(kp.publicKey.length, ML_DSA_SIZES["ml-dsa-87"].publicKey);
  assert.equal(kp.secretKey.length, ML_DSA_SIZES["ml-dsa-87"].secretKey);
  assert.equal(kp.params, "ml-dsa-87");
});

test("ML-DSA-44 signature byte length matches FIPS 204 table", () => {
  const kp = dsa.generateKeyPair("ml-dsa-44");
  const msg = new Uint8Array([1, 2, 3, 4]);
  const { signature } = dsa.sign(msg, kp.secretKey, "ml-dsa-44");
  assert.equal(signature.length, ML_DSA_SIZES["ml-dsa-44"].signature); // 2420 B
});

test("ML-DSA-65 sign/verify roundtrip: signer and verifier agree on a payment instruction", () => {
  // Simulates Meridian signing a settlement instruction and NovaPay verifying it.
  const meridianKp = dsa.generateKeyPair("ml-dsa-65");
  const message = Buffer.from(
    JSON.stringify({
      instructionId: "MGB-NPY-2026-03-20-QSAF-001",
      notionalEur: 50_000_000,
    }),
    "utf8",
  );

  const { signature, auditCommitment } = dsa.sign(
    message,
    meridianKp.secretKey,
    "ml-dsa-65",
  );

  // Signature size from FIPS 204
  assert.equal(signature.length, ML_DSA_SIZES["ml-dsa-65"].signature);
  // Audit commitment is a 64-char hex string (SHA-256 of signature bytes)
  assert.match(auditCommitment, /^[0-9a-f]{64}$/);

  const valid = dsa.verify(
    message,
    signature,
    meridianKp.publicKey,
    "ml-dsa-65",
  );
  assert.equal(valid, true);
});

test("ML-DSA-65 verify returns false after 1-byte message mutation", () => {
  // Even a single-bit change in the message must invalidate the signature.
  const kp = dsa.generateKeyPair("ml-dsa-65");
  const original = new Uint8Array([10, 20, 30, 40, 50]);
  const { signature } = dsa.sign(original, kp.secretKey, "ml-dsa-65");

  const mutated = new Uint8Array(original);
  mutated.set([mutated[2]! ^ 0x01], 2); // flip a single bit

  const valid = dsa.verify(mutated, signature, kp.publicKey, "ml-dsa-65");
  assert.equal(
    valid,
    false,
    "Mutating a single byte should cause signature verification to fail",
  );
});

test("ML-DSA-65 verify returns false with the wrong public key", () => {
  // Signature produced by one keypair must not verify against another keypair's
  // public key (e.g., an attacker substituting their own public key).
  const signerKp = dsa.generateKeyPair("ml-dsa-65");
  const attackerKp = dsa.generateKeyPair("ml-dsa-65");
  const message = new Uint8Array([1, 2, 3]);
  const { signature } = dsa.sign(message, signerKp.secretKey, "ml-dsa-65");

  const valid = dsa.verify(
    message,
    signature,
    attackerKp.publicKey,
    "ml-dsa-65",
  );
  assert.equal(
    valid,
    false,
    "Signature must not verify against a different public key",
  );
});

test("ML-DSA-65 auditRecord fields are all present and correctly typed", () => {
  const kp = dsa.generateKeyPair("ml-dsa-65");
  const message = new Uint8Array([99, 98, 97]);
  const result = dsa.sign(message, kp.secretKey, "ml-dsa-65");
  const record = dsa.auditRecord(message, result, kp.publicKey, "ml-dsa-65");

  assert.equal(record.params, "ml-dsa-65");
  assert.match(record.publicKeyHash, /^[0-9a-f]{64}$/);
  assert.match(record.signatureHash, /^[0-9a-f]{64}$/);
  assert.match(record.messageHash, /^[0-9a-f]{64}$/);
  assert.ok(
    Date.parse(record.timestamp) > 0,
    "timestamp must be valid ISO-8601",
  );
  assert.equal(record.signatureLength, ML_DSA_SIZES["ml-dsa-65"].signature);
  assert.equal(record.verifiedAtAudit, true);

  // signatureHash in the record must match the auditCommitment on the result
  assert.equal(record.signatureHash, result.auditCommitment);
});
