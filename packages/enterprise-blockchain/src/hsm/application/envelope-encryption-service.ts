import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type {
  EncryptedRecord,
  EnvelopeEncryptionResult,
  WrappedKey,
} from "../domain/entities.js";
import type { AuditLog } from "../domain/ports.js";
import type { SymmetricKeyService } from "./symmetric-key-service.js";

/**
 * DEK/KEK envelope encryption — ephemeral DEK wrapped by a stored KEK.
 *
 * The resulting ciphertext is suitable for storage on a distributed ledger:
 *  - encryptedRecord  = AES-256-GCM ciphertext of the payload
 *  - wrappedDek       = GCM-wrapped DEK (only the HSM can unwrap it)
 */
export class EnvelopeEncryptionService {
  constructor(
    private readonly symmetric: SymmetricKeyService,
    private readonly audit: AuditLog,
  ) {}

  encrypt(kekLabel: string, plaintext: string): EnvelopeEncryptionResult {
    const dek = randomBytes(32);

    const payloadIv = randomBytes(12);
    const payloadCipher = createCipheriv("aes-256-gcm", dek, payloadIv);
    const ciphertextBuf = Buffer.concat([
      payloadCipher.update(plaintext, "utf8"),
      payloadCipher.final(),
    ]);
    const payloadAuthTag = payloadCipher.getAuthTag();

    const encryptedRecord: EncryptedRecord = {
      ciphertext: ciphertextBuf.toString("hex"),
      iv: payloadIv.toString("hex"),
      authTag: payloadAuthTag.toString("hex"),
      algorithm: "aes-256-gcm",
    };

    const wrappedDek = this.symmetric.wrapKey(dek, kekLabel);
    dek.fill(0);

    this.audit.record("encryptWithEnvelope", kekLabel, "success");
    return { encryptedRecord, wrappedDek };
  }

  decrypt(wrappedDek: WrappedKey, encryptedRecord: EncryptedRecord): string {
    const dek = this.symmetric.unwrapKey(wrappedDek);

    const iv = Buffer.from(encryptedRecord.iv, "hex");
    const authTag = Buffer.from(encryptedRecord.authTag, "hex");
    const ciphertext = Buffer.from(encryptedRecord.ciphertext, "hex");

    try {
      const decipher = createDecipheriv("aes-256-gcm", dek, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
      this.audit.record("decryptWithEnvelope", wrappedDek.kekLabel, "success");
      return plaintext;
    } catch {
      this.audit.record(
        "decryptWithEnvelope",
        wrappedDek.kekLabel,
        "failed",
        "GCM authentication failed",
      );
      throw new Error("HSM decryptWithEnvelope: GCM authentication failed");
    } finally {
      dek.fill(0);
    }
  }
}
