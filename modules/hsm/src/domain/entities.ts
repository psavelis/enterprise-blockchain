import type { KeyObject } from "node:crypto";

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

// Internal key store entry types — shared across HSM services.
export interface AsymmetricKeyEntry {
  kind: "asymmetric";
  keyLabel: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  namedCurve: "P-256";
  createdAt: string;
}

export interface SymmetricKeyEntry {
  kind: "symmetric";
  keyLabel: string;
  key: Buffer;
  createdAt: string;
}

export type KeyEntry = AsymmetricKeyEntry | SymmetricKeyEntry;
