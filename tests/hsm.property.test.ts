/**
 * Property-based fuzz tests for HSM cryptographic modules.
 *
 * Tests envelope encryption round-trip properties and key management invariants.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fc from "fast-check";

import { HsmClient } from "../modules/hsm/src/index";

// Helper to create an initialized HSM client
function createHsm(slotId = "test-slot"): HsmClient {
  const hsm = new HsmClient();
  hsm.initialize({ slotId, label: "Property Test HSM" });
  return hsm;
}

// ── Envelope Encryption Properties ──────────────────────────────────────────

test("envelope encryption: round-trip preserves plaintext", () => {
  const hsm = createHsm("roundtrip-slot");
  const kekLabel = "test-roundtrip-kek";
  hsm.generateSymmetricKey(kekLabel);

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
});

test("envelope encryption: different plaintexts produce different ciphertexts", () => {
  const hsm = createHsm("diff-slot");
  const kekLabel = "test-diff-kek";
  hsm.generateSymmetricKey(kekLabel);

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 1000, unit: "binary-ascii" }),
      fc.string({ minLength: 1, maxLength: 1000, unit: "binary-ascii" }),
      (plaintext1, plaintext2) => {
        if (plaintext1 === plaintext2) return true; // Skip identical inputs

        const result1 = hsm.encryptWithEnvelope(kekLabel, plaintext1);
        const result2 = hsm.encryptWithEnvelope(kekLabel, plaintext2);

        // Ciphertexts should be different
        return (
          result1.encryptedRecord.ciphertext !==
          result2.encryptedRecord.ciphertext
        );
      },
    ),
    { numRuns: 50 },
  );
});

test("envelope encryption: same plaintext with different DEKs produces different IVs and wrapped keys", () => {
  const hsm = createHsm("iv-slot");
  const kekLabel = "test-iv-kek";
  hsm.generateSymmetricKey(kekLabel);

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 1000, unit: "binary-ascii" }),
      (plaintext) => {
        const result1 = hsm.encryptWithEnvelope(kekLabel, plaintext);
        const result2 = hsm.encryptWithEnvelope(kekLabel, plaintext);

        // IVs should be different (12 bytes random)
        if (result1.encryptedRecord.iv === result2.encryptedRecord.iv) {
          return false;
        }

        // Wrapped DEKs should be different (different DEK each time)
        if (result1.wrappedDek.wrappedDek === result2.wrappedDek.wrappedDek) {
          return false;
        }

        // Note: We do NOT check ciphertext uniqueness because for short plaintexts
        // (e.g., 1 byte), the ciphertext has limited entropy (only 256 possible values),
        // making collisions statistically likely by the birthday paradox.
        // The security guarantee is that different IVs prevent key-stream reuse.

        // Both should decrypt to same plaintext
        const decrypted1 = hsm.decryptWithEnvelope(
          result1.wrappedDek,
          result1.encryptedRecord,
        );
        const decrypted2 = hsm.decryptWithEnvelope(
          result2.wrappedDek,
          result2.encryptedRecord,
        );
        return decrypted1 === plaintext && decrypted2 === plaintext;
      },
    ),
    { numRuns: 50 },
  );
});

// ── Asymmetric Signing Properties ───────────────────────────────────────────

test("ECDSA: sign-verify round-trip succeeds for valid signatures", () => {
  const hsm = createHsm("sign-slot");
  const keyLabel = "test-sign-key";
  hsm.generateKeyPair(keyLabel);

  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 10000 }), (message) => {
      const { signature } = hsm.sign(keyLabel, message);
      const isValid = hsm.verify(keyLabel, message, signature);
      return isValid === true;
    }),
    { numRuns: 100 },
  );
});

test("ECDSA: different messages produce different signatures", () => {
  const hsm = createHsm("diff-sign-slot");
  const keyLabel = "test-diff-sign-key";
  hsm.generateKeyPair(keyLabel);

  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 1000 }),
      fc.string({ minLength: 1, maxLength: 1000 }),
      (message1, message2) => {
        if (message1 === message2) return true; // Skip identical inputs

        const { signature: sig1 } = hsm.sign(keyLabel, message1);
        const { signature: sig2 } = hsm.sign(keyLabel, message2);

        // Signatures should be different for different messages
        return sig1 !== sig2;
      },
    ),
    { numRuns: 50 },
  );
});

test("ECDSA: tampered message fails verification", () => {
  const hsm = createHsm("tamper-slot");
  const keyLabel = "test-tamper-key";
  hsm.generateKeyPair(keyLabel);

  fc.assert(
    fc.property(
      fc.string({ minLength: 2, maxLength: 1000 }),
      fc.integer({ min: 0, max: 100 }),
      (message, tamperPos) => {
        const { signature } = hsm.sign(keyLabel, message);

        // Tamper with the message
        const pos = tamperPos % message.length;
        const tamperedChar = message[pos] === "x" ? "y" : "x";
        const tamperedMessage =
          message.slice(0, pos) + tamperedChar + message.slice(pos + 1);

        if (tamperedMessage === message) return true; // Skip if tamper had no effect

        const isValid = hsm.verify(keyLabel, tamperedMessage, signature);
        return isValid === false;
      },
    ),
    { numRuns: 50 },
  );
});

// ── Key Management Properties ───────────────────────────────────────────────

test("key generation: each KEK produces usable envelope encryption", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => /^[a-z0-9-]+$/i.test(s)),
        { minLength: 1, maxLength: 5 },
      ),
      (labels) => {
        // Use crypto.randomUUID() instead of Math.random() for secure test slot IDs.
        // This prevents patterns that could leak to production code.
        const hsm = createHsm(`keygen-slot-${randomUUID()}`);
        const uniqueLabels = [...new Set(labels)];

        for (const label of uniqueLabels) {
          hsm.generateSymmetricKey(label);
        }

        // All keys should be usable for envelope encryption
        for (const label of uniqueLabels) {
          const { encryptedRecord, wrappedDek } = hsm.encryptWithEnvelope(
            label,
            "test-data",
          );
          assert.ok(encryptedRecord.ciphertext.length > 0);
          assert.ok(wrappedDek.wrappedDek.length > 0);
        }

        return true;
      },
    ),
    { numRuns: 20 },
  );
});

// ── Wrapped DEK Properties ──────────────────────────────────────────────────

test("envelope encryption: each envelope has unique wrapped DEK", () => {
  const hsm = createHsm("unique-dek-slot");
  const kekLabel = "test-unique-dek";
  hsm.generateSymmetricKey(kekLabel);

  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 1000 }), (plaintext) => {
      const result1 = hsm.encryptWithEnvelope(kekLabel, plaintext);
      const result2 = hsm.encryptWithEnvelope(kekLabel, plaintext);

      // Each encryption should use a different DEK
      assert.notEqual(
        result1.wrappedDek.wrappedDek,
        result2.wrappedDek.wrappedDek,
      );

      // Both should decrypt correctly
      const decrypted1 = hsm.decryptWithEnvelope(
        result1.wrappedDek,
        result1.encryptedRecord,
      );
      const decrypted2 = hsm.decryptWithEnvelope(
        result2.wrappedDek,
        result2.encryptedRecord,
      );

      return decrypted1 === plaintext && decrypted2 === plaintext;
    }),
    { numRuns: 30 },
  );
});

// ── Audit Log Properties ────────────────────────────────────────────────────

test("audit log: all operations are recorded", () => {
  const hsm = createHsm("audit-slot");
  const kekLabel = "test-audit-kek";
  const keyPairLabel = "test-audit-keypair";

  // Perform various operations
  hsm.generateSymmetricKey(kekLabel);
  hsm.generateKeyPair(keyPairLabel);
  hsm.encryptWithEnvelope(kekLabel, "test-data");
  hsm.sign(keyPairLabel, "test-message");

  const auditLog = hsm.getAuditLog();

  // Should have at least: initialize, generateSymmetricKey, generateKeyPair,
  // encryptWithEnvelope (wrapKey), sign
  assert.ok(auditLog.length >= 5);

  // All entries should have timestamps
  for (const entry of auditLog) {
    assert.ok(entry.timestamp.length > 0);
    assert.ok(entry.operation.length > 0);
  }
});
