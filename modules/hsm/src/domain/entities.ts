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

export interface HsmKeyPair {
  keyLabel: string;
  keyType: "EC";
  namedCurve: "P-256";
  publicKeyPem: string;
  privateKeyHandle: string;
  createdAt: string;
}

export interface HsmSignatureResult {
  keyLabel: string;
  algorithm: "ecdsa-sha256";
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
 */
export interface AsymmetricKeyEntry {
  kind: "asymmetric";
  keyLabel: string;
  /** PEM-encoded private key */
  privateKeyPem: string;
  /** PEM-encoded public key */
  publicKeyPem: string;
  namedCurve: "P-256";
  createdAt: string;
}

export interface SymmetricKeyEntry {
  kind: "symmetric";
  keyLabel: string;
  /** Base64-encoded key material */
  keyBase64: string;
  createdAt: string;
}

export type KeyEntry = AsymmetricKeyEntry | SymmetricKeyEntry;
