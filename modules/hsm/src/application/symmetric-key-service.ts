import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { SymmetricKeyEntry, WrappedKey } from "../domain/entities";
import type {
  AesKeySize,
  AuditLog,
  HsmCryptoPort,
  KeyStore,
} from "../domain/ports";

/**
 * Options for symmetric key generation.
 */
export interface SymmetricKeyGenOptions {
  /** Key size in bits: 128 or 256 (default: 256) */
  keyBits?: AesKeySize;
}

/**
 * AES-256-GCM symmetric operations — key generation, wrapping, unwrapping.
 *
 * The raw key is stored as Uint8Array in the domain entity to enable
 * explicit zeroization. In a production HSM the key never leaves
 * hardware-protected storage. Do not persist or log the key bytes.
 *
 * SECURITY: Intermediate key buffers are zeroized after use to minimize
 * key material exposure in memory.
 *
 * Supports two modes:
 * - Simulator (default): Uses node:crypto for key operations
 * - PKCS#11: Uses hardware HSM via HsmCryptoPort for real key protection
 *
 * Mirrors PKCS#11 mechanisms:
 * - CKM_AES_KEY_GEN
 * - CKM_AES_GCM (for wrapping/unwrapping)
 */
export class SymmetricKeyService {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly audit: AuditLog,
    /** Optional crypto port for hardware HSM support */
    private readonly crypto?: HsmCryptoPort,
  ) {}

  // ---------------------------------------------------------------------------
  // Synchronous Methods (Backward Compatible - Simulator Only)
  // ---------------------------------------------------------------------------

  /**
   * Generate AES-256 symmetric key (synchronous, simulator only).
   * For hardware HSM support, use generateSymmetricKeyAsync().
   */
  generateSymmetricKey(keyLabel: string): void {
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }
    const keyBytes = randomBytes(32);
    const handle = `sim:aes:${randomBytes(8).toString("hex")}`;

    this.keyStore.set(keyLabel, {
      kind: "symmetric",
      keyLabel,
      handle,
      keyBytes,
      keyBits: 256,
      createdAt: new Date().toISOString(),
    });
    this.audit.record("generateSymmetricKey", keyLabel, "success");
  }

  /**
   * Wrap a DEK (data encryption key) using the KEK (key encryption key).
   * Synchronous version for simulator only. For hardware HSM, use wrapKeyAsync().
   *
   * SECURITY: The kekBuffer is zeroized after use.
   */
  wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey {
    const kek = this.requireSymmetric(kekLabel);
    const kekBuffer = Buffer.from(kek.keyBytes);
    const iv = randomBytes(12);
    // Select algorithm based on key size
    const algorithm =
      kek.keyBits === 128 ? "aes-128-gcm" : ("aes-256-gcm" as const);

    try {
      const cipher = createCipheriv(algorithm, kekBuffer, iv);
      const wrappedDek = Buffer.concat([
        cipher.update(plaintextDek),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      this.audit.record("wrapKey", kekLabel, "success");

      return {
        algorithm,
        wrappedDek: wrappedDek.toString("hex"),
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
        kekLabel,
        wrappedAt: new Date().toISOString(),
      };
    } finally {
      // Zeroize intermediate key material
      kekBuffer.fill(0);
    }
  }

  /**
   * Unwrap a DEK using the KEK.
   * Synchronous version for simulator only. For hardware HSM, use unwrapKeyAsync().
   *
   * SECURITY: The kekBuffer is zeroized after use.
   * CALLER RESPONSIBILITY: The returned DEK buffer MUST be zeroized
   * after use via `dekBuffer.fill(0)`.
   */
  unwrapKey(wrapped: WrappedKey): Buffer {
    const kek = this.requireSymmetric(wrapped.kekLabel);
    const kekBuffer = Buffer.from(kek.keyBytes);
    const iv = Buffer.from(wrapped.iv, "hex");
    const authTag = Buffer.from(wrapped.authTag, "hex");
    const wrappedBuf = Buffer.from(wrapped.wrappedDek, "hex");
    // Use algorithm from wrapped key metadata
    const algorithm = wrapped.algorithm;

    try {
      const decipher = createDecipheriv(algorithm, kekBuffer, iv);
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
    } finally {
      // Zeroize intermediate key material
      kekBuffer.fill(0);
    }
  }

  // ---------------------------------------------------------------------------
  // Asynchronous Methods (Hardware HSM Support)
  // ---------------------------------------------------------------------------

  /**
   * Generate symmetric key asynchronously.
   * Supports AES-128 and AES-256.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   */
  async generateSymmetricKeyAsync(
    keyLabel: string,
    options?: SymmetricKeyGenOptions,
  ): Promise<void> {
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }

    const keyBits = options?.keyBits ?? 256;
    const createdAt = new Date().toISOString();
    let handle: string;
    let keyBytes: Uint8Array;

    if (this.crypto) {
      // Use hardware HSM - key never leaves hardware
      handle = await this.crypto.generateAesKey(keyBits);
      keyBytes = new Uint8Array(0); // Empty for PKCS#11
    } else {
      // Fall back to simulator
      keyBytes = randomBytes(keyBits / 8);
      handle = `sim:aes:${randomBytes(8).toString("hex")}`;
    }

    this.keyStore.set(keyLabel, {
      kind: "symmetric",
      keyLabel,
      handle,
      keyBytes,
      keyBits,
      createdAt,
    });

    this.audit.record(
      "generateSymmetricKey",
      keyLabel,
      "success",
      `${keyBits}-bit`,
    );
  }

  /**
   * Wrap a DEK using the KEK asynchronously.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   *
   * SECURITY: For simulator mode, kekBuffer is zeroized after use.
   */
  async wrapKeyAsync(
    plaintextDek: Buffer,
    kekLabel: string,
  ): Promise<WrappedKey> {
    const kek = this.requireSymmetric(kekLabel);
    const wrappedAt = new Date().toISOString();
    // Select algorithm based on key size
    const algorithm =
      kek.keyBits === 128 ? "aes-128-gcm" : ("aes-256-gcm" as const);

    if (this.crypto) {
      // Use hardware HSM
      const result = await this.crypto.wrapKey(plaintextDek, kek.handle);

      this.audit.record("wrapKey", kekLabel, "success");

      return {
        algorithm,
        wrappedDek: result.wrappedDek.toString("hex"),
        iv: result.iv.toString("hex"),
        authTag: result.authTag.toString("hex"),
        kekLabel,
        wrappedAt,
      };
    }

    // Fall back to simulator (same as sync version)
    const kekBuffer = Buffer.from(kek.keyBytes);
    const iv = randomBytes(12);

    try {
      const cipher = createCipheriv(algorithm, kekBuffer, iv);
      const wrappedDek = Buffer.concat([
        cipher.update(plaintextDek),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      this.audit.record("wrapKey", kekLabel, "success");

      return {
        algorithm,
        wrappedDek: wrappedDek.toString("hex"),
        iv: iv.toString("hex"),
        authTag: authTag.toString("hex"),
        kekLabel,
        wrappedAt,
      };
    } finally {
      kekBuffer.fill(0);
    }
  }

  /**
   * Unwrap a DEK using the KEK asynchronously.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   *
   * SECURITY: For simulator mode, kekBuffer is zeroized after use.
   * CALLER RESPONSIBILITY: The returned DEK buffer MUST be zeroized
   * after use via `dekBuffer.fill(0)`.
   */
  async unwrapKeyAsync(wrapped: WrappedKey): Promise<Buffer> {
    const kek = this.requireSymmetric(wrapped.kekLabel);
    const iv = Buffer.from(wrapped.iv, "hex");
    const authTag = Buffer.from(wrapped.authTag, "hex");
    const wrappedBuf = Buffer.from(wrapped.wrappedDek, "hex");

    if (this.crypto) {
      // Use hardware HSM
      try {
        const plaintext = await this.crypto.unwrapKey(
          wrappedBuf,
          iv,
          authTag,
          kek.handle,
        );
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

    // Fall back to simulator (same as sync version)
    const kekBuffer = Buffer.from(kek.keyBytes);
    // Select algorithm based on key size
    const algorithm = kek.keyBits === 128 ? "aes-128-gcm" : "aes-256-gcm";

    try {
      const decipher = createDecipheriv(algorithm, kekBuffer, iv);
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
    } finally {
      kekBuffer.fill(0);
    }
  }

  /**
   * Check if a symmetric key exists.
   */
  hasKey(keyLabel: string): boolean {
    const entry = this.keyStore.get(keyLabel);
    return entry !== undefined && entry.kind === "symmetric";
  }

  /**
   * Destroy a symmetric key.
   * Securely zeroizes the key material before deletion.
   */
  async destroyKeyAsync(keyLabel: string): Promise<void> {
    const entry = this.keyStore.get(keyLabel);
    if (!entry || entry.kind !== "symmetric") {
      return; // Key doesn't exist or not symmetric
    }

    // Zeroize key bytes if present
    if (entry.keyBytes && entry.keyBytes.length > 0) {
      entry.keyBytes.fill(0);
    }

    // Destroy in hardware HSM if available
    if (this.crypto && this.crypto.destroyKey) {
      await this.crypto.destroyKey(entry.handle);
    }

    this.keyStore.delete(keyLabel);
    this.audit.record("destroyKey", keyLabel, "success");
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

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
