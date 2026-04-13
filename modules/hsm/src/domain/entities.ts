/**
 * HSM Domain Entities
 *
 * These types define the HSM domain model. They MUST NOT depend on
 * infrastructure types (like node:crypto KeyObject) to maintain
 * hexagonal architecture purity.
 *
 * @see docs/adr/ADR-0001-hexagonal-architecture.md
 */

export interface HsmSlotConfig {
  slotId: string;
  label: string;
}

/**
 * Key types supported by the HSM.
 */
export type HsmKeyType = "EC" | "Ed" | "RSA";

/**
 * Named curves for EC and Ed keys.
 */
export type HsmNamedCurve = "P-256" | "P-384" | "Ed25519";

export interface HsmKeyPair {
  keyLabel: string;
  keyType: HsmKeyType;
  namedCurve?: HsmNamedCurve;
  /** RSA key size in bits (only for RSA keys) */
  rsaBits?: 2048 | 4096;
  publicKeyPem: string;
  privateKeyHandle: string;
  createdAt: string;
}

/**
 * Signature algorithms supported for HsmSignatureResult.
 */
export type HsmSignatureAlgorithm =
  | "ecdsa-sha256"
  | "ecdsa-sha384"
  | "ed25519"
  | "rsa-pss-sha256"
  | "rsa-pkcs1-sha256";

export interface HsmSignatureResult {
  keyLabel: string;
  algorithm: HsmSignatureAlgorithm;
  signature: string;
  publicKeyPem: string;
  timestamp: string;
  hsmAttestation: string;
}

export interface WrappedKey {
  algorithm: "aes-256-gcm";
  wrappedDek: string;
  iv: string;
  authTag: string;
  kekLabel: string;
  wrappedAt: string;
}

export interface EncryptedRecord {
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

/**
 * Opaque handle for asymmetric keys.
 *
 * The domain should not know about the underlying key representation.
 * The handle contains PEM-encoded keys which are portable and
 * infrastructure-agnostic.
 */
export interface AsymmetricKeyHandle {
  /** PEM-encoded private key (PKCS#8 format) */
  privateKeyPem: string;
  /** PEM-encoded public key (SPKI format) */
  publicKeyPem: string;
}

/**
 * Internal key store entry for asymmetric keys.
 *
 * Uses PEM strings instead of KeyObject to keep domain types
 * infrastructure-agnostic. The infrastructure layer converts
 * to/from KeyObject as needed.
 *
 * For PKCS#11 backend, privateKeyPem is empty and handle references
 * the key object on the HSM.
 */
export interface AsymmetricKeyEntry {
  kind: "asymmetric";
  keyLabel: string;
  /**
   * Opaque handle for the crypto adapter.
   * For simulator: internal ID like "sim:ec:1"
   * For PKCS#11: hex-encoded object handle
   */
  handle: string;
  /**
   * PEM-encoded private key (simulator only).
   * Empty string for PKCS#11 where keys never leave hardware.
   */
  privateKeyPem: string;
  /** PEM-encoded public key (SPKI format) */
  publicKeyPem: string;
  /** Key type: EC, Ed, or RSA */
  keyType: HsmKeyType;
  /** Named curve for EC/Ed keys */
  namedCurve?: HsmNamedCurve;
  /** RSA key size in bits (only for RSA keys) */
  rsaBits?: 2048 | 4096;
  createdAt: string;
}

export interface SymmetricKeyEntry {
  kind: "symmetric";
  keyLabel: string;
  /**
   * Opaque handle for the crypto adapter.
   * For simulator: internal ID like "sim:aes:1"
   * For PKCS#11: hex-encoded object handle
   */
  handle: string;
  /**
   * Raw key material as a byte array (simulator only).
   *
   * Using Uint8Array instead of a base64 string enables explicit zeroization
   * of in-memory key material. The infrastructure layer handles encoding/decoding
   * at boundaries.
   *
   * SECURITY: This field represents the long-lived stored key material managed
   * by the key store. Callers MUST NOT mutate or zeroize this buffer directly.
   * Instead, create an ephemeral copy (e.g. `const key = Buffer.from(entry.keyBytes);`)
   * for cryptographic operations, and securely zeroize that ephemeral copy after use.
   *
   * For PKCS#11: This will be an empty Uint8Array since keys never leave hardware.
   */
  keyBytes: Uint8Array;
  /** Key size in bits */
  keyBits: 128 | 256;
  createdAt: string;
}

export type KeyEntry = AsymmetricKeyEntry | SymmetricKeyEntry;
