import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { SymmetricKeyEntry, WrappedKey } from "../domain/entities";
import type { AuditLog, KeyStore } from "../domain/ports";

/**
 * AES-256-GCM symmetric operations — key generation, wrapping, unwrapping.
 *
 * The raw key buffer is held in process memory for the lifetime of the
 * service. In a production HSM the key never leaves hardware-protected
 * storage. Do not persist or log the buffer.
 */
export class SymmetricKeyService {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly audit: AuditLog,
  ) {}

  generateSymmetricKey(keyLabel: string): void {
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }
    this.keyStore.set(keyLabel, {
      kind: "symmetric",
      keyLabel,
      key: randomBytes(32),
      createdAt: new Date().toISOString(),
    });
    this.audit.record("generateSymmetricKey", keyLabel, "success");
  }

  wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey {
    const kek = this.requireSymmetric(kekLabel);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek.key, iv);
    const wrappedDek = Buffer.concat([
      cipher.update(plaintextDek),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    this.audit.record("wrapKey", kekLabel, "success");

    return {
      algorithm: "aes-256-gcm",
      wrappedDek: wrappedDek.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      kekLabel,
      wrappedAt: new Date().toISOString(),
    };
  }

  unwrapKey(wrapped: WrappedKey): Buffer {
    const kek = this.requireSymmetric(wrapped.kekLabel);
    const iv = Buffer.from(wrapped.iv, "hex");
    const authTag = Buffer.from(wrapped.authTag, "hex");
    const wrappedBuf = Buffer.from(wrapped.wrappedDek, "hex");

    try {
      const decipher = createDecipheriv("aes-256-gcm", kek.key, iv);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([
        decipher.update(wrappedBuf),
        decipher.final(),
      ]);
      this.audit.record("unwrapKey", wrapped.kekLabel, "success");
      return plaintext;
    } catch {
      this.audit.record(
        "unwrapKey",
        wrapped.kekLabel,
        "failed",
        "GCM authentication failed",
      );
      throw new Error("HSM unwrapKey: GCM authentication failed");
    }
  }

  requireSymmetric(kekLabel: string): SymmetricKeyEntry {
    const entry = this.keyStore.get(kekLabel);
    if (!entry) {
      this.audit.record("keyLookup", kekLabel, "failed", "key not found");
      throw new Error(`HSM key not found: ${kekLabel}`);
    }
    if (entry.kind !== "symmetric") {
      this.audit.record("keyLookup", kekLabel, "failed", "unexpected key type");
      throw new Error(`HSM key '${kekLabel}' is not a symmetric key`);
    }
    return entry;
  }
}
