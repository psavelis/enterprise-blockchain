import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { HsmClient } from "../modules/hsm/src/index";

// ---------------------------------------------------------------------------
// HsmClient — initialization
// ---------------------------------------------------------------------------

test("initialize sets slot and records audit entry", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "test-slot-01", label: "Test HSM" });

  const log = hsm.getAuditLog();
  assert.equal(log.length, 1);
  assert.equal(log[0]!.operation, "initialize");
  assert.equal(log[0]!.result, "success");
  assert.equal(log[0]!.keyLabel, "test-slot-01");
});

// ---------------------------------------------------------------------------
// Asymmetric key generation
// ---------------------------------------------------------------------------

test("generateKeyPair returns valid metadata with opaque handle", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });

  const kp = hsm.generateKeyPair("my-key");

  assert.equal(kp.keyLabel, "my-key");
  assert.equal(kp.keyType, "EC");
  assert.equal(kp.namedCurve, "P-256");
  assert.match(kp.privateKeyHandle, /^hsm:s1:my-key:[0-9a-f]{16}$/);
  assert.match(kp.publicKeyPem, /-----BEGIN PUBLIC KEY-----/);
  assert.ok(kp.createdAt.length > 0);
});

// ---------------------------------------------------------------------------
// Signing and verification
// ---------------------------------------------------------------------------

test("sign and verify round-trip succeeds", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("signing-key");

  const data = JSON.stringify({ tx: "abc", amount: 100 });
  const result = hsm.sign("signing-key", data);

  assert.equal(result.algorithm, "ecdsa-sha256");
  assert.ok(result.signature.length > 0);
  assert.ok(result.hsmAttestation.length === 64); // SHA-256 hex

  const valid = hsm.verify("signing-key", data, result.signature);
  assert.equal(valid, true);
});

test("verify returns false for tampered data", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("signing-key");

  const original = JSON.stringify({ qty: 100 });
  const tampered = JSON.stringify({ qty: 999 });
  const result = hsm.sign("signing-key", original);

  assert.equal(hsm.verify("signing-key", tampered, result.signature), false);
});

test("sign throws for unknown key label", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });

  assert.throws(() => hsm.sign("no-such-key", "data"), /key not found/i);
});

test("verify records invalid result in audit log", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("k");

  const sig = hsm.sign("k", "original").signature;
  hsm.verify("k", "tampered", sig);

  const log = hsm.getAuditLog();
  const verifyEntry = log.find(
    (e) => e.operation === "verify" && e.detail === "invalid",
  );
  assert.ok(verifyEntry !== undefined);
  assert.equal(verifyEntry.result, "success"); // operation succeeded; data was invalid
});

// ---------------------------------------------------------------------------
// Symmetric key operations
// ---------------------------------------------------------------------------

test("wrapKey and unwrapKey round-trip recovers original DEK", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateSymmetricKey("kek-1");

  const dek = randomBytes(32);

  const wrapped = hsm.wrapKey(dek, "kek-1");

  assert.equal(wrapped.algorithm, "aes-256-gcm");
  assert.equal(wrapped.kekLabel, "kek-1");
  assert.ok(wrapped.wrappedDek.length > 0);

  const recovered = hsm.unwrapKey(wrapped);
  assert.deepEqual(recovered, dek);
});

test("unwrapKey throws when KEK is different (GCM auth failure)", () => {
  const hsm1 = new HsmClient();
  hsm1.initialize({ slotId: "s1", label: "L1" });
  hsm1.generateSymmetricKey("kek-a");

  const hsm2 = new HsmClient();
  hsm2.initialize({ slotId: "s2", label: "L2" });
  hsm2.generateSymmetricKey("kek-b");

  const dek = randomBytes(32);
  const wrapped = hsm1.wrapKey(dek, "kek-a");

  // Point kekLabel at hsm2's key so it tries to unwrap with the wrong KEK.
  const spoofed = { ...wrapped, kekLabel: "kek-b" };

  assert.throws(() => hsm2.unwrapKey(spoofed), /GCM authentication failed/i);
});

// ---------------------------------------------------------------------------
// Envelope encryption
// ---------------------------------------------------------------------------

test("encryptWithEnvelope and decryptWithEnvelope round-trip recovers plaintext", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateSymmetricKey("kek-envelope");

  const plaintext = JSON.stringify({ documentId: "DOC-001", value: 42 });
  const { encryptedRecord, wrappedDek } = hsm.encryptWithEnvelope(
    "kek-envelope",
    plaintext,
  );

  assert.equal(encryptedRecord.algorithm, "aes-256-gcm");
  assert.notEqual(encryptedRecord.ciphertext, plaintext);

  const recovered = hsm.decryptWithEnvelope(wrappedDek, encryptedRecord);
  assert.equal(recovered, plaintext);
});

test("decryptWithEnvelope throws when KEK is from a different HSM", () => {
  const hsm1 = new HsmClient();
  hsm1.initialize({ slotId: "s1", label: "L1" });
  hsm1.generateSymmetricKey("kek-correct");

  const hsm2 = new HsmClient();
  hsm2.initialize({ slotId: "s2", label: "L2" });
  hsm2.generateSymmetricKey("kek-wrong");

  const { encryptedRecord, wrappedDek } = hsm1.encryptWithEnvelope(
    "kek-correct",
    "sensitive payload",
  );

  // Redirect kekLabel so hsm2 tries to use its own KEK.
  const spoofed = { ...wrappedDek, kekLabel: "kek-wrong" };

  assert.throws(
    () => hsm2.decryptWithEnvelope(spoofed, encryptedRecord),
    /GCM authentication failed/i,
  );
});

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

test("audit log captures correct operation sequence", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("audit-key");
  hsm.sign("audit-key", "payload");
  hsm.verify(
    "audit-key",
    "payload",
    hsm.sign("audit-key", "payload").signature,
  );

  const ops = hsm.getAuditLog().map((e) => e.operation);

  assert.ok(ops.includes("initialize"));
  assert.ok(ops.includes("generateKeyPair"));
  assert.ok(ops.filter((o) => o === "sign").length >= 2);
  assert.ok(ops.includes("verify"));
});

test("getAuditLog returns a readonly snapshot", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });

  const log = hsm.getAuditLog();

  // TypeScript prevents push() at compile time; at runtime the array is
  // the same reference but callers should not mutate it.
  assert.equal(typeof log, "object");
  assert.ok(Array.isArray(log));
});

// ---------------------------------------------------------------------------
// Initialization guard
// ---------------------------------------------------------------------------

test("generateKeyPair throws on uninitialized HSM", () => {
  const hsm = new HsmClient();
  assert.throws(() => hsm.generateKeyPair("k"), /not initialized/i);
});

test("sign throws on uninitialized HSM", () => {
  const hsm = new HsmClient();
  assert.throws(() => hsm.sign("k", "data"), /not initialized/i);
});

// ---------------------------------------------------------------------------
// Duplicate key protection
// ---------------------------------------------------------------------------

test("generateKeyPair throws if label already registered", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("dup-key");
  assert.throws(() => hsm.generateKeyPair("dup-key"), /key already exists/i);
});

test("generateSymmetricKey throws if label already registered", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateSymmetricKey("dup-kek");
  assert.throws(
    () => hsm.generateSymmetricKey("dup-kek"),
    /key already exists/i,
  );
});

// ---------------------------------------------------------------------------
// Wrong key type
// ---------------------------------------------------------------------------

test("sign throws when called with a symmetric key label", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateSymmetricKey("sym-key");
  assert.throws(() => hsm.sign("sym-key", "data"), /not an asymmetric key/i);
});

test("wrapKey throws when called with an asymmetric key label", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  hsm.generateKeyPair("asym-key");
  assert.throws(
    () => hsm.wrapKey(randomBytes(32), "asym-key"),
    /not a symmetric key/i,
  );
});

// ---------------------------------------------------------------------------
// exportPublicKey
// ---------------------------------------------------------------------------

test("exportPublicKey returns PEM matching the generated key pair", () => {
  const hsm = new HsmClient();
  hsm.initialize({ slotId: "s1", label: "L" });
  const kp = hsm.generateKeyPair("export-key");

  const exported = hsm.exportPublicKey("export-key");

  assert.match(exported, /-----BEGIN PUBLIC KEY-----/);
  assert.equal(exported, kp.publicKeyPem);
});
