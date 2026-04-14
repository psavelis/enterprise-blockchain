import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type {
  EncryptedRecord,
  EnvelopeEncryptionResult,
  WrappedKey,
} from "../domain/entities";
import type { AuditLog } from "../domain/ports";
import type { SymmetricKeyService } from "./symmetric-key-service";

/**
 * DEK/KEK envelope encryption — ephemeral DEK wrapped by a stored KEK.
 *
 * The resulting ciphertext is suitable for storage on a distributed ledger:
 *  - encryptedRecord  = AES-256-GCM ciphertext of the payload
 *  - wrappedDek       = GCM-wrapped DEK (only the HSM can unwrap it)
 *
 * Supports two modes:
 * - Simulator (default): Uses node:crypto for key operations
 * - PKCS#11: Uses hardware HSM via SymmetricKeyService async methods
 */
export class EnvelopeEncryptionService {
  constructor(
    private readonly symmetric: SymmetricKeyService,
    private readonly audit: AuditLog,
  ) {}

  // ---------------------------------------------------------------------------
  // Synchronous Methods (Backward Compatible - Simulator Only)
  // ---------------------------------------------------------------------------

  /**
   * Encrypt with envelope encryption (synchronous, simulator only).
   * For hardware HSM support, use encryptAsync().
   */
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

  /**
   * Decrypt with envelope encryption (synchronous, simulator only).
   * For hardware HSM support, use decryptAsync().
   */
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

  // ---------------------------------------------------------------------------
  // Asynchronous Methods (Hardware HSM Support)
  // ---------------------------------------------------------------------------

  /**
   * Encrypt with envelope encryption asynchronously.
   * Uses SymmetricKeyService.wrapKeyAsync() for hardware HSM support.
   */
  async encryptAsync(
    kekLabel: string,
    plaintext: string,
  ): Promise<EnvelopeEncryptionResult> {
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

    // Use async wrap for PKCS#11 support
    const wrappedDek = await this.symmetric.wrapKeyAsync(dek, kekLabel);
    dek.fill(0);

    this.audit.record("encryptWithEnvelope", kekLabel, "success");
    return { encryptedRecord, wrappedDek };
  }

  /**
   * Decrypt with envelope encryption asynchronously.
   * Uses SymmetricKeyService.unwrapKeyAsync() for hardware HSM support.
   */
  async decryptAsync(
    wrappedDek: WrappedKey,
    encryptedRecord: EncryptedRecord,
  ): Promise<string> {
    // Use async unwrap for PKCS#11 support
    const dek = await this.symmetric.unwrapKeyAsync(wrappedDek);

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
