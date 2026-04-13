// Domain
export type {
  HsmSlotConfig,
  HsmKeyPair,
  HsmSignatureResult,
  HsmKeyType,
  HsmNamedCurve,
  HsmSignatureAlgorithm,
  WrappedKey,
  EncryptedRecord,
  EnvelopeEncryptionResult,
  HsmAuditEntry,
} from "./domain/entities";
export type {
  KeyStore,
  AuditLog,
  HsmCryptoPort,
  HsmCryptoConfig,
  SimulatorCryptoConfig,
  Pkcs11CryptoConfig,
  SigningAlgorithm,
  EcCurve,
  EdCurve,
  RsaKeySize,
  AesKeySize,
  KeyGenerationResult,
  WrapKeyResult,
} from "./domain/ports";

// Application
export { AsymmetricKeyService } from "./application/asymmetric-key-service";
export type { KeyGenOptions } from "./application/asymmetric-key-service";
export { SymmetricKeyService } from "./application/symmetric-key-service";
export type { SymmetricKeyGenOptions } from "./application/symmetric-key-service";
export { EnvelopeEncryptionService } from "./application/envelope-encryption-service";

// Infrastructure - Adapters
export {
  SimulatorCryptoAdapter,
  Pkcs11CryptoAdapter,
} from "./infrastructure/adapters";

// Infrastructure - Persistence & Audit
export { InMemoryAuditLog } from "./infrastructure/audit-log";
export { InMemoryKeyStore } from "./infrastructure/key-store";
export { FileAuditLog } from "./infrastructure/file-audit-log";
export type { ChainedAuditEntry } from "./infrastructure/file-audit-log";
export {
  SyslogAuditLog,
  DEFAULT_SYSLOG_CONFIG,
} from "./infrastructure/syslog-audit-log";
export type {
  SyslogConfig,
  SyslogSeverity,
  SyslogFacility,
} from "./infrastructure/syslog-audit-log";
export {
  AuditLogFactory,
  AUDIT_LOG_ENV,
} from "./infrastructure/audit-log-factory";
export type {
  AuditLogType,
  AuditLogFactoryConfig,
} from "./infrastructure/audit-log-factory";

// ---------------------------------------------------------------------------
// Facade — preserves the original HsmClient API.
//
// Composes AsymmetricKeyService, SymmetricKeyService, EnvelopeEncryptionService,
// InMemoryKeyStore, and InMemoryAuditLog behind the same public surface.
//
// Supports two modes:
// - Simulator (default): Uses node:crypto for all key operations
// - PKCS#11: Uses real hardware HSM via graphene-pk11
//
// Use async methods (e.g., generateKeyPairAsync) for PKCS#11 support.
// Sync methods are backward-compatible but only work with the simulator.
// ---------------------------------------------------------------------------

import type {
  HsmSlotConfig,
  HsmKeyPair,
  HsmSignatureResult,
  HsmSignatureAlgorithm,
  WrappedKey,
  EncryptedRecord,
  EnvelopeEncryptionResult,
  HsmAuditEntry,
} from "./domain/entities";
import type { HsmCryptoConfig, HsmCryptoPort } from "./domain/ports";
import {
  AsymmetricKeyService,
  type KeyGenOptions,
} from "./application/asymmetric-key-service";
import {
  SymmetricKeyService,
  type SymmetricKeyGenOptions,
} from "./application/symmetric-key-service";
import { EnvelopeEncryptionService } from "./application/envelope-encryption-service";
import { InMemoryAuditLog } from "./infrastructure/audit-log";
import { InMemoryKeyStore } from "./infrastructure/key-store";
import { SimulatorCryptoAdapter } from "./infrastructure/adapters";

/**
 * Configuration for HsmClient.
 *
 * For simulator mode (default):
 * ```ts
 * const hsm = new HsmClient();
 * hsm.initialize({ slotId: "slot-0", label: "Test HSM" });
 * ```
 *
 * For PKCS#11 mode:
 * ```ts
 * const hsm = new HsmClient();
 * await hsm.initializeAsync({
 *   slotId: "slot-0",
 *   label: "Production HSM",
 *   crypto: {
 *     type: "pkcs11",
 *     libraryPath: "/usr/lib/softhsm/libsofthsm2.so",
 *     slotId: 0,
 *     pin: "1234",
 *   },
 * });
 * ```
 */
export interface HsmClientConfig extends HsmSlotConfig {
  /** Optional crypto backend configuration. Defaults to simulator. */
  crypto?: HsmCryptoConfig;
}

/**
 * Software simulation of a PKCS#11-style HSM.
 *
 * Private keys and raw symmetric material are stored inside the object and
 * never returned to callers — only opaque handles or PEM public keys are
 * surfaced externally.  All operations are appended to an immutable audit log.
 *
 * Supports two modes:
 * - **Simulator (default)**: Uses node:crypto for key operations. Use sync methods.
 * - **PKCS#11**: Uses real hardware HSM via graphene-pk11. Use async methods.
 *
 * For PKCS#11 mode, use `initializeAsync()` and all `*Async()` methods.
 * Sync methods are backward-compatible but only work with the simulator.
 *
 * Ref: PKCS#11 v3.1 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 */
export class HsmClient {
  private initialized = false;
  private slotId = "";
  private readonly store = new InMemoryKeyStore();
  private readonly audit = new InMemoryAuditLog();
  private crypto: HsmCryptoPort | undefined;
  private asymmetric: AsymmetricKeyService | null = null;
  private symmetric: SymmetricKeyService | null = null;
  private envelope: EnvelopeEncryptionService | null = null;

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize the HSM (synchronous, simulator only).
   * For PKCS#11 support, use initializeAsync().
   */
  initialize(config: HsmSlotConfig): void {
    this.validateConfig(config);
    this.slotId = config.slotId;
    this.asymmetric = new AsymmetricKeyService(
      this.store,
      this.audit,
      this.slotId,
    );
    this.symmetric = new SymmetricKeyService(this.store, this.audit);
    this.envelope = new EnvelopeEncryptionService(this.symmetric, this.audit);
    this.initialized = true;
    this.audit.record("initialize", config.slotId, "success", config.label);
  }

  /**
   * Initialize the HSM asynchronously with optional PKCS#11 support.
   *
   * @example
   * // Simulator mode (default)
   * await hsm.initializeAsync({ slotId: "slot-0", label: "Test HSM" });
   *
   * @example
   * // PKCS#11 mode with SoftHSM2
   * await hsm.initializeAsync({
   *   slotId: "slot-0",
   *   label: "Production HSM",
   *   crypto: {
   *     type: "pkcs11",
   *     libraryPath: "/usr/lib/softhsm/libsofthsm2.so",
   *     slotId: 0,
   *     pin: "1234",
   *   },
   * });
   */
  async initializeAsync(config: HsmClientConfig): Promise<void> {
    this.validateConfig(config);
    this.slotId = config.slotId;

    // Initialize crypto backend
    if (config.crypto) {
      if (config.crypto.type === "pkcs11") {
        // Dynamically import PKCS#11 adapter
        const { Pkcs11CryptoAdapter } =
          await import("./infrastructure/adapters");
        this.crypto = new Pkcs11CryptoAdapter();
      } else {
        this.crypto = new SimulatorCryptoAdapter();
      }
      await this.crypto.initialize(config.crypto);
    } else {
      // Default to simulator
      this.crypto = new SimulatorCryptoAdapter();
      await this.crypto.initialize({ type: "simulator" });
    }

    // Create services with crypto port
    this.asymmetric = new AsymmetricKeyService(
      this.store,
      this.audit,
      this.slotId,
      this.crypto,
    );
    this.symmetric = new SymmetricKeyService(
      this.store,
      this.audit,
      this.crypto,
    );
    this.envelope = new EnvelopeEncryptionService(this.symmetric, this.audit);

    this.initialized = true;
    this.audit.record(
      "initialize",
      config.slotId,
      "success",
      `${config.label} (${config.crypto?.type ?? "simulator"})`,
    );
  }

  /**
   * Finalize the HSM and release resources.
   * Call this when done using PKCS#11 mode to properly close the session.
   */
  async finalizeAsync(): Promise<void> {
    if (this.crypto) {
      await this.crypto.finalize();
      this.crypto = undefined;
    }
    this.initialized = false;
    this.audit.record("finalize", this.slotId, "success");
  }

  // ---------------------------------------------------------------------------
  // Asymmetric Key Operations (Sync - Backward Compatible)
  // ---------------------------------------------------------------------------

  /**
   * Generate EC P-256 key pair (synchronous, simulator only).
   * For PKCS#11 or other key types, use generateKeyPairAsync().
   */
  generateKeyPair(keyLabel: string): HsmKeyPair {
    return this.requireAsymmetric().generateKeyPair(keyLabel);
  }

  /**
   * Sign data (synchronous, simulator only).
   * For PKCS#11 support, use signAsync().
   */
  sign(keyLabel: string, data: string): HsmSignatureResult {
    return this.requireAsymmetric().sign(keyLabel, data);
  }

  /**
   * Verify signature (synchronous, simulator only).
   * For PKCS#11 support, use verifyAsync().
   */
  verify(keyLabel: string, data: string, signature: string): boolean {
    return this.requireAsymmetric().verify(keyLabel, data, signature);
  }

  /**
   * Export public key (synchronous).
   */
  exportPublicKey(keyLabel: string): string {
    return this.requireAsymmetric().exportPublicKey(keyLabel);
  }

  // ---------------------------------------------------------------------------
  // Asymmetric Key Operations (Async - PKCS#11 Support)
  // ---------------------------------------------------------------------------

  /**
   * Generate key pair asynchronously.
   * Supports EC P-256, P-384, Ed25519, RSA-2048, RSA-4096.
   *
   * @example
   * // EC P-256 (default)
   * const kp = await hsm.generateKeyPairAsync("my-key");
   *
   * @example
   * // Ed25519
   * const kp = await hsm.generateKeyPairAsync("my-ed-key", {
   *   keyType: "Ed",
   *   namedCurve: "Ed25519",
   * });
   *
   * @example
   * // RSA-4096
   * const kp = await hsm.generateKeyPairAsync("my-rsa-key", {
   *   keyType: "RSA",
   *   rsaBits: 4096,
   * });
   */
  async generateKeyPairAsync(
    keyLabel: string,
    options?: KeyGenOptions,
  ): Promise<HsmKeyPair> {
    return this.requireAsymmetric().generateKeyPairAsync(keyLabel, options);
  }

  /**
   * Sign data asynchronously.
   * Supports ECDSA-SHA256, ECDSA-SHA384, Ed25519, RSA-PSS-SHA256, RSA-PKCS1-SHA256.
   */
  async signAsync(
    keyLabel: string,
    data: string,
    algorithm?: HsmSignatureAlgorithm,
  ): Promise<HsmSignatureResult> {
    return this.requireAsymmetric().signAsync(keyLabel, data, algorithm);
  }

  /**
   * Verify signature asynchronously.
   */
  async verifyAsync(
    keyLabel: string,
    data: string,
    signature: string,
    algorithm?: HsmSignatureAlgorithm,
  ): Promise<boolean> {
    return this.requireAsymmetric().verifyAsync(
      keyLabel,
      data,
      signature,
      algorithm,
    );
  }

  /**
   * Export public key asynchronously.
   */
  async exportPublicKeyAsync(keyLabel: string): Promise<string> {
    return this.requireAsymmetric().exportPublicKeyAsync(keyLabel);
  }

  // ---------------------------------------------------------------------------
  // Symmetric Key Operations (Sync - Backward Compatible)
  // ---------------------------------------------------------------------------

  /**
   * Generate AES-256 symmetric key (synchronous, simulator only).
   * For PKCS#11 or other key sizes, use generateSymmetricKeyAsync().
   */
  generateSymmetricKey(keyLabel: string): void {
    this.requireSymmetric().generateSymmetricKey(keyLabel);
  }

  /**
   * Wrap a DEK with a KEK (synchronous, simulator only).
   * For PKCS#11 support, use wrapKeyAsync().
   */
  wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey {
    return this.requireSymmetric().wrapKey(plaintextDek, kekLabel);
  }

  /**
   * Unwrap a DEK (synchronous, simulator only).
   * For PKCS#11 support, use unwrapKeyAsync().
   */
  unwrapKey(wrapped: WrappedKey): Buffer {
    return this.requireSymmetric().unwrapKey(wrapped);
  }

  // ---------------------------------------------------------------------------
  // Symmetric Key Operations (Async - PKCS#11 Support)
  // ---------------------------------------------------------------------------

  /**
   * Generate symmetric key asynchronously.
   * Supports AES-128 and AES-256.
   *
   * @example
   * // AES-256 (default)
   * await hsm.generateSymmetricKeyAsync("my-kek");
   *
   * @example
   * // AES-128
   * await hsm.generateSymmetricKeyAsync("my-kek-128", { keyBits: 128 });
   */
  async generateSymmetricKeyAsync(
    keyLabel: string,
    options?: SymmetricKeyGenOptions,
  ): Promise<void> {
    return this.requireSymmetric().generateSymmetricKeyAsync(keyLabel, options);
  }

  /**
   * Wrap a DEK with a KEK asynchronously.
   */
  async wrapKeyAsync(
    plaintextDek: Buffer,
    kekLabel: string,
  ): Promise<WrappedKey> {
    return this.requireSymmetric().wrapKeyAsync(plaintextDek, kekLabel);
  }

  /**
   * Unwrap a DEK asynchronously.
   */
  async unwrapKeyAsync(wrapped: WrappedKey): Promise<Buffer> {
    return this.requireSymmetric().unwrapKeyAsync(wrapped);
  }

  // ---------------------------------------------------------------------------
  // Envelope Encryption (Sync - Backward Compatible)
  // ---------------------------------------------------------------------------

  /**
   * Encrypt with envelope encryption (synchronous, simulator only).
   * For PKCS#11 support, use encryptWithEnvelopeAsync().
   */
  encryptWithEnvelope(
    kekLabel: string,
    plaintext: string,
  ): EnvelopeEncryptionResult {
    return this.requireEnvelope().encrypt(kekLabel, plaintext);
  }

  /**
   * Decrypt with envelope encryption (synchronous, simulator only).
   * For PKCS#11 support, use decryptWithEnvelopeAsync().
   */
  decryptWithEnvelope(
    wrappedDek: WrappedKey,
    encryptedRecord: EncryptedRecord,
  ): string {
    return this.requireEnvelope().decrypt(wrappedDek, encryptedRecord);
  }

  // ---------------------------------------------------------------------------
  // Envelope Encryption (Async - PKCS#11 Support)
  // ---------------------------------------------------------------------------

  /**
   * Encrypt with envelope encryption asynchronously.
   */
  async encryptWithEnvelopeAsync(
    kekLabel: string,
    plaintext: string,
  ): Promise<EnvelopeEncryptionResult> {
    return this.requireEnvelope().encryptAsync(kekLabel, plaintext);
  }

  /**
   * Decrypt with envelope encryption asynchronously.
   */
  async decryptWithEnvelopeAsync(
    wrappedDek: WrappedKey,
    encryptedRecord: EncryptedRecord,
  ): Promise<string> {
    return this.requireEnvelope().decryptAsync(wrappedDek, encryptedRecord);
  }

  // ---------------------------------------------------------------------------
  // Audit
  // ---------------------------------------------------------------------------

  /**
   * Get the audit log entries.
   */
  getAuditLog(): readonly HsmAuditEntry[] {
    return this.audit.entries();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private validateConfig(config: HsmSlotConfig): void {
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
