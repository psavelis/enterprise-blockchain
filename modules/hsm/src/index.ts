import {
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
  generateKeyPairSync,
  KeyObject,
  randomBytes,
} from "node:crypto";

import { sha256hex } from "../../shared/src/crypto";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface HsmSlotConfig {
  slotId: string;
  label: string;
}

export interface HsmKeyPair {
  keyLabel: string;
  keyType: "EC";
  namedCurve: "P-256";
  /** PEM-encoded SubjectPublicKeyInfo — safe to distribute */
  publicKeyPem: string;
  /** Opaque handle — the private key never leaves the HSM boundary */
  privateKeyHandle: string;
  createdAt: string;
}

export interface HsmSignatureResult {
  keyLabel: string;
  algorithm: "ecdsa-sha256";
  /** DER-encoded ECDSA signature, hex-encoded */
  signature: string;
  publicKeyPem: string;
  timestamp: string;
  /** SHA-256(slotId:keyLabel:timestamp:signature) — attests HSM origin */
  hsmAttestation: string;
}

export interface WrappedKey {
  algorithm: "aes-256-gcm";
  /** AES-256-GCM ciphertext of the DEK, hex-encoded */
  wrappedDek: string;
  iv: string;
  authTag: string;
  kekLabel: string;
  wrappedAt: string;
}

export interface EncryptedRecord {
  /** AES-256-GCM ciphertext of the plaintext, hex-encoded */
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: "aes-256-gcm";
}

export interface EnvelopeEncryptionResult {
  encryptedRecord: EncryptedRecord;
  wrappedDek: WrappedKey;
}

export interface HsmAuditEntry {
  timestamp: string;
  operation: string;
  keyLabel: string;
  result: "success" | "failed";
  detail?: string;
}

// ---------------------------------------------------------------------------
// Internal types — never exported
// ---------------------------------------------------------------------------

interface AsymmetricKeyEntry {
  kind: "asymmetric";
  keyLabel: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  namedCurve: "P-256";
  createdAt: string;
}

interface SymmetricKeyEntry {
  kind: "symmetric";
  keyLabel: string;
  key: Buffer;
  createdAt: string;
}

type KeyEntry = AsymmetricKeyEntry | SymmetricKeyEntry;

// ---------------------------------------------------------------------------
// HsmClient
// ---------------------------------------------------------------------------

/**
 * Software simulation of a PKCS#11-style HSM.
 *
 * Private keys and raw symmetric material are stored inside the object and
 * never returned to callers — only opaque handles or PEM public keys are
 * surfaced externally.  All operations are appended to an immutable audit log.
 *
 * Supported cryptographic primitives (all via Node.js built-in `node:crypto`):
 *   - EC P-256 key generation, ECDSA-SHA256 signing and verification
 *   - AES-256-GCM symmetric key generation, key wrapping and unwrapping
 *   - AES-256-GCM envelope encryption (ephemeral DEK wrapped by stored KEK)
 */
export class HsmClient {
  private initialized = false;
  private slotId = "";
  private slotLabel = "";
  private readonly keyStore = new Map<string, KeyEntry>();
  private readonly auditLog: HsmAuditEntry[] = [];

  /** Bind this client to an HSM slot.  Must be called before any other method. */
  initialize(config: HsmSlotConfig): void {
    if (config.slotId.trim().length === 0) {
      throw new Error("HSM initialize: slotId must not be empty");
    }
    if (config.label.trim().length === 0) {
      throw new Error("HSM initialize: label must not be empty");
    }
    if (this.initialized) {
      throw new Error(
        `HSM already initialized on slot '${this.slotId}' — create a new HsmClient instance for a different slot`,
      );
    }
    this.slotId = config.slotId;
    this.slotLabel = config.label;
    this.initialized = true;
    this.record("initialize", config.slotId, "success", config.label);
  }

  // -------------------------------------------------------------------------
  // Asymmetric key operations
  // -------------------------------------------------------------------------

  /**
   * Generate an EC P-256 key pair under `keyLabel`.
   * Returns metadata and an opaque private-key handle; the private key is
   * never exposed outside this object.
   */
  generateKeyPair(keyLabel: string): HsmKeyPair {
    this.assertInitialized();
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });

    const createdAt = new Date().toISOString();
    const handle = `hsm:${this.slotId}:${keyLabel}:${randomBytes(8).toString("hex")}`;

    this.keyStore.set(keyLabel, {
      kind: "asymmetric",
      keyLabel,
      privateKey,
      publicKey,
      namedCurve: "P-256",
      createdAt,
    });

    const publicKeyPem = this.pemExport(publicKey);

    this.record("generateKeyPair", keyLabel, "success");

    return {
      keyLabel,
      keyType: "EC",
      namedCurve: "P-256",
      publicKeyPem,
      privateKeyHandle: handle,
      createdAt,
    };
  }

  /**
   * Sign `data` with the EC private key stored under `keyLabel`.
   * Returns the DER-encoded signature (hex) plus an HSM attestation digest.
   */
  sign(keyLabel: string, data: string): HsmSignatureResult {
    this.assertInitialized();
    const entry = this.requireAsymmetric(keyLabel);
    const timestamp = new Date().toISOString();

    const signer = createSign("SHA256");
    signer.update(data);
    signer.end();
    const signatureBuf = signer.sign(entry.privateKey);
    const signature = signatureBuf.toString("hex");

    const hsmAttestation = sha256hex(
      `${this.slotId}:${keyLabel}:${timestamp}:${signature}`,
    );

    const publicKeyPem = this.pemExport(entry.publicKey);

    this.record("sign", keyLabel, "success");

    return {
      keyLabel,
      algorithm: "ecdsa-sha256",
      signature,
      publicKeyPem,
      timestamp,
      hsmAttestation,
    };
  }

  /**
   * Verify an ECDSA-SHA256 signature against the public key stored under `keyLabel`.
   * Returns `true` if the signature is valid, `false` otherwise.
   */
  verify(keyLabel: string, data: string, signature: string): boolean {
    this.assertInitialized();
    const entry = this.requireAsymmetric(keyLabel);

    const verifier = createVerify("SHA256");
    verifier.update(data);
    verifier.end();
    const valid = verifier.verify(
      entry.publicKey,
      Buffer.from(signature, "hex"),
    );

    this.record("verify", keyLabel, "success", valid ? "valid" : "invalid");
    return valid;
  }

  /**
   * Export the PEM-encoded public key for `keyLabel`.
   * Safe to distribute to counterparties for signature verification.
   */
  exportPublicKey(keyLabel: string): string {
    this.assertInitialized();
    const entry = this.requireAsymmetric(keyLabel);
    this.record("exportPublicKey", keyLabel, "success");
    return this.pemExport(entry.publicKey);
  }

  // -------------------------------------------------------------------------
  // Symmetric key operations
  // -------------------------------------------------------------------------

  /**
   * Generate a 256-bit AES key and store it under `keyLabel`.
   * The raw key material is never returned — it can only be used via
   * `wrapKey`, `unwrapKey`, and `encryptWithEnvelope`.
   *
   * NOTE: the raw key buffer is held in process memory for the lifetime of
   * this HsmClient instance.  In a production HSM the key never leaves
   * hardware-protected storage.  Do not persist or log the buffer.
   */
  generateSymmetricKey(keyLabel: string): void {
    this.assertInitialized();
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }
    const createdAt = new Date().toISOString();
    this.keyStore.set(keyLabel, {
      kind: "symmetric",
      keyLabel,
      key: randomBytes(32),
      createdAt,
    });
    this.record("generateSymmetricKey", keyLabel, "success");
  }

  /**
   * Wrap (encrypt) `plaintextDek` using the AES-256-GCM KEK stored under `kekLabel`.
   * Returns the wrapped DEK together with the IV and GCM authentication tag.
   */
  wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey {
    this.assertInitialized();
    const kek = this.requireSymmetric(kekLabel);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", kek.key, iv);
    const wrappedDek = Buffer.concat([
      cipher.update(plaintextDek),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    this.record("wrapKey", kekLabel, "success");

    return {
      algorithm: "aes-256-gcm",
      wrappedDek: wrappedDek.toString("hex"),
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      kekLabel,
      wrappedAt: new Date().toISOString(),
    };
  }

  /**
   * Unwrap a previously wrapped DEK using the KEK stored under the label
   * recorded in `wrapped.kekLabel`.
   * Throws if GCM authentication fails (wrong KEK or tampered ciphertext).
   */
  unwrapKey(wrapped: WrappedKey): Buffer {
    this.assertInitialized();
    const kek = this.requireSymmetric(wrapped.kekLabel);
    const iv = Buffer.from(wrapped.iv, "hex");
    const authTag = Buffer.from(wrapped.authTag, "hex");
    const wrappedBuf = Buffer.from(wrapped.wrappedDek, "hex");

    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv("aes-256-gcm", kek.key, iv);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([
        decipher.update(wrappedBuf),
        decipher.final(),
      ]);
    } catch {
      this.record(
        "unwrapKey",
        wrapped.kekLabel,
        "failed",
        "GCM authentication failed",
      );
      throw new Error("HSM unwrapKey: GCM authentication failed");
    }

    this.record("unwrapKey", wrapped.kekLabel, "success");
    return plaintext;
  }

  // -------------------------------------------------------------------------
  // Envelope encryption
  // -------------------------------------------------------------------------

  /**
   * Encrypt `plaintext` using a freshly generated DEK, then wrap the DEK
   * with the KEK stored under `kekLabel`.
   *
   * The result is suitable for storage on a distributed ledger:
   *   - `encryptedRecord` is the AES-256-GCM ciphertext of the payload
   *   - `wrappedDek` contains the GCM-wrapped DEK (only the HSM can unwrap it)
   */
  encryptWithEnvelope(
    kekLabel: string,
    plaintext: string,
  ): EnvelopeEncryptionResult {
    this.assertInitialized();
    // Generate an ephemeral DEK — never stored in this HSM instance.
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

    const wrappedDek = this.wrapKey(dek, kekLabel);
    // Zero the ephemeral DEK buffer so the raw key material is not retained
    // in the JS heap beyond this call frame.
    dek.fill(0);

    this.record("encryptWithEnvelope", kekLabel, "success");
    return { encryptedRecord, wrappedDek };
  }

  /**
   * Decrypt an envelope-encrypted record.
   * Unwraps the DEK using the KEK in `wrappedDek.kekLabel`, then decrypts
   * the payload.  Throws if GCM authentication fails at either layer.
   */
  decryptWithEnvelope(
    wrappedDek: WrappedKey,
    encryptedRecord: EncryptedRecord,
  ): string {
    this.assertInitialized();
    const dek = this.unwrapKey(wrappedDek);

    const iv = Buffer.from(encryptedRecord.iv, "hex");
    const authTag = Buffer.from(encryptedRecord.authTag, "hex");
    const ciphertext = Buffer.from(encryptedRecord.ciphertext, "hex");

    let plaintext: string;
    try {
      const decipher = createDecipheriv("aes-256-gcm", dek, iv);
      decipher.setAuthTag(authTag);
      plaintext = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      this.record(
        "decryptWithEnvelope",
        wrappedDek.kekLabel,
        "failed",
        "GCM authentication failed",
      );
      throw new Error("HSM decryptWithEnvelope: GCM authentication failed");
    }

    this.record("decryptWithEnvelope", wrappedDek.kekLabel, "success");
    return plaintext;
  }

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  /** Return the full, immutable audit log for this HSM session. */
  getAuditLog(): readonly HsmAuditEntry[] {
    return this.auditLog;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("HSM not initialized: call initialize() first");
    }
  }

  /**
   * Export `key` as a PEM-encoded SubjectPublicKeyInfo string.
   * Node.js `KeyObject.export()` returns `string` when `format: "pem"` is
   * specified, but its TypeScript overloads type the return as `string | Buffer`.
   * This helper consolidates the single safe cast in one place.
   */
  private pemExport(key: KeyObject): string {
    const pem = key.export({ type: "spki", format: "pem" });
    if (typeof pem !== "string") {
      throw new Error("HSM: unexpected binary output from PEM export");
    }
    return pem;
  }

  private requireAsymmetric(keyLabel: string): AsymmetricKeyEntry {
    const entry = this.keyStore.get(keyLabel);
    if (!entry) {
      this.record("keyLookup", keyLabel, "failed", "key not found");
      throw new Error(`HSM key not found: ${keyLabel}`);
    }
    if (entry.kind !== "asymmetric") {
      this.record("keyLookup", keyLabel, "failed", "unexpected key type");
      throw new Error(`HSM key '${keyLabel}' is not an asymmetric key`);
    }
    return entry;
  }

  private requireSymmetric(keyLabel: string): SymmetricKeyEntry {
    const entry = this.keyStore.get(keyLabel);
    if (!entry) {
      this.record("keyLookup", keyLabel, "failed", "key not found");
      throw new Error(`HSM key not found: ${keyLabel}`);
    }
    if (entry.kind !== "symmetric") {
      this.record("keyLookup", keyLabel, "failed", "unexpected key type");
      throw new Error(`HSM key '${keyLabel}' is not a symmetric key`);
    }
    return entry;
  }

  private record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void {
    const entry: HsmAuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      keyLabel,
      result,
    };
    if (detail !== undefined) {
      entry.detail = detail;
    }
    this.auditLog.push(entry);
  }
}
