// Domain
export type {
  HsmSlotConfig,
  HsmKeyPair,
  HsmSignatureResult,
  WrappedKey,
  EncryptedRecord,
  EnvelopeEncryptionResult,
  HsmAuditEntry,
} from "./domain/entities";
export type { KeyStore, AuditLog } from "./domain/ports";

// Application
export { AsymmetricKeyService } from "./application/asymmetric-key-service";
export { SymmetricKeyService } from "./application/symmetric-key-service";
export { EnvelopeEncryptionService } from "./application/envelope-encryption-service";

// Infrastructure
export { InMemoryAuditLog } from "./infrastructure/audit-log";
export { InMemoryKeyStore } from "./infrastructure/key-store";

// ---------------------------------------------------------------------------
// Facade — preserves the original HsmClient API.
//
// Composes AsymmetricKeyService, SymmetricKeyService, EnvelopeEncryptionService,
// InMemoryKeyStore, and InMemoryAuditLog behind the same public surface.
// ---------------------------------------------------------------------------

import type {
  HsmSlotConfig,
  HsmKeyPair,
  HsmSignatureResult,
  WrappedKey,
  EncryptedRecord,
  EnvelopeEncryptionResult,
  HsmAuditEntry,
} from "./domain/entities";
import { AsymmetricKeyService } from "./application/asymmetric-key-service";
import { SymmetricKeyService } from "./application/symmetric-key-service";
import { EnvelopeEncryptionService } from "./application/envelope-encryption-service";
import { InMemoryAuditLog } from "./infrastructure/audit-log";
import { InMemoryKeyStore } from "./infrastructure/key-store";

/**
 * Software simulation of a PKCS#11-style HSM.
 *
 * Private keys and raw symmetric material are stored inside the object and
 * never returned to callers — only opaque handles or PEM public keys are
 * surfaced externally.  All operations are appended to an immutable audit log.
 *
 * Ref: PKCS#11 v3.1 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 */
export class HsmClient {
  private initialized = false;
  private slotId = "";
  private readonly store = new InMemoryKeyStore();
  private readonly audit = new InMemoryAuditLog();
  private asymmetric: AsymmetricKeyService | null = null;
  private symmetric: SymmetricKeyService | null = null;
  private envelope: EnvelopeEncryptionService | null = null;

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
    this.initialized = true;
    this.asymmetric = new AsymmetricKeyService(
      this.store,
      this.audit,
      this.slotId,
    );
    this.symmetric = new SymmetricKeyService(this.store, this.audit);
    this.envelope = new EnvelopeEncryptionService(this.symmetric, this.audit);
    this.audit.record("initialize", config.slotId, "success", config.label);
  }

  generateKeyPair(keyLabel: string): HsmKeyPair {
    return this.requireAsymmetric().generateKeyPair(keyLabel);
  }

  sign(keyLabel: string, data: string): HsmSignatureResult {
    return this.requireAsymmetric().sign(keyLabel, data);
  }

  verify(keyLabel: string, data: string, signature: string): boolean {
    return this.requireAsymmetric().verify(keyLabel, data, signature);
  }

  exportPublicKey(keyLabel: string): string {
    return this.requireAsymmetric().exportPublicKey(keyLabel);
  }

  generateSymmetricKey(keyLabel: string): void {
    this.requireSymmetric().generateSymmetricKey(keyLabel);
  }

  wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey {
    return this.requireSymmetric().wrapKey(plaintextDek, kekLabel);
  }

  unwrapKey(wrapped: WrappedKey): Buffer {
    return this.requireSymmetric().unwrapKey(wrapped);
  }

  encryptWithEnvelope(
    kekLabel: string,
    plaintext: string,
  ): EnvelopeEncryptionResult {
    return this.requireEnvelope().encrypt(kekLabel, plaintext);
  }

  decryptWithEnvelope(
    wrappedDek: WrappedKey,
    encryptedRecord: EncryptedRecord,
  ): string {
    return this.requireEnvelope().decrypt(wrappedDek, encryptedRecord);
  }

  getAuditLog(): readonly HsmAuditEntry[] {
    return this.audit.entries();
  }

  private requireAsymmetric(): AsymmetricKeyService {
    this.assertInitialized();
    return this.asymmetric!;
  }

  private requireSymmetric(): SymmetricKeyService {
    this.assertInitialized();
    return this.symmetric!;
  }

  private requireEnvelope(): EnvelopeEncryptionService {
    this.assertInitialized();
    return this.envelope!;
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("HSM not initialized: call initialize() first");
    }
  }
}
