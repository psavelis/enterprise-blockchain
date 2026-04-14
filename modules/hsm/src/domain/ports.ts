import type { HsmAuditEntry, KeyEntry } from "./entities";

/**
 * Port for the HSM key store — decouples domain services from storage.
 */
export interface KeyStore {
  has(label: string): boolean;
  get(label: string): KeyEntry | undefined;
  set(label: string, entry: KeyEntry): void;
  delete(label: string): boolean;
}

/**
 * Port for the HSM audit log.
 *
 * Ref: NIST SP 800-57 Part 1, §8.1 — key management lifecycle auditing
 * https://csrc.nist.gov/pubs/sp/800-57/pt1/r5/final
 */
export interface AuditLog {
  record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void;
  entries(): readonly HsmAuditEntry[];
}

// ---------------------------------------------------------------------------
// HSM Crypto Port — abstracts crypto backend (simulator vs real PKCS#11)
// ---------------------------------------------------------------------------

/**
 * Signing algorithms supported by the HSM crypto port.
 *
 * Maps to PKCS#11 mechanisms:
 * - ecdsa-sha256: CKM_ECDSA_SHA256 (EC P-256, P-384)
 * - ecdsa-sha384: CKM_ECDSA_SHA384 (EC P-384)
 * - ed25519: CKM_EDDSA (Ed25519 pure EdDSA)
 * - rsa-pss-sha256: CKM_RSA_PKCS_PSS with SHA-256
 * - rsa-pkcs1-sha256: CKM_RSA_PKCS with SHA-256 (legacy)
 */
export type SigningAlgorithm =
  | "ecdsa-sha256"
  | "ecdsa-sha384"
  | "ed25519"
  | "rsa-pss-sha256"
  | "rsa-pkcs1-sha256";

/**
 * Elliptic curve types for key generation.
 */
export type EcCurve = "P-256" | "P-384";

/**
 * Edwards curve types for EdDSA key generation.
 */
export type EdCurve = "Ed25519";

/**
 * RSA key sizes in bits.
 */
export type RsaKeySize = 2048 | 4096;

/**
 * AES key sizes in bits.
 */
export type AesKeySize = 128 | 256;

/**
 * Key generation result with opaque handle and public key.
 */
export interface KeyGenerationResult {
  /** Opaque handle for referencing the key in subsequent operations */
  handle: string;
  /** PEM-encoded public key (SPKI format) */
  publicKeyPem: string;
}

/**
 * Result of AES-GCM key wrapping operation.
 */
export interface WrapKeyResult {
  /** Wrapped (encrypted) DEK */
  wrappedDek: Buffer;
  /** Initialization vector used for wrapping */
  iv: Buffer;
  /** GCM authentication tag */
  authTag: Buffer;
}

/**
 * Port for HSM cryptographic operations.
 *
 * Abstracts the crypto backend to support both:
 * - Software simulator (node:crypto) for development/testing
 * - Real PKCS#11 hardware HSMs (Thales, Utimaco, SafeNet, AWS CloudHSM, etc.)
 *
 * Supports full key suite: EC P-256/P-384, Ed25519, RSA-2048/4096, AES-128/256
 *
 * Ref: PKCS#11 v3.1 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 */
export interface HsmCryptoPort {
  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the crypto backend.
   * For PKCS#11: loads library, opens session, logs in.
   * For simulator: no-op.
   */
  initialize(config: HsmCryptoConfig): Promise<void>;

  /**
   * Finalize the crypto backend.
   * For PKCS#11: logs out, closes session, finalizes module.
   * For simulator: zeroizes in-memory keys.
   */
  finalize(): Promise<void>;

  // ---------------------------------------------------------------------------
  // Asymmetric Key Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate EC key pair (P-256 or P-384).
   * PKCS#11: CKM_EC_KEY_PAIR_GEN
   */
  generateEcKeyPair(curve: EcCurve): Promise<KeyGenerationResult>;

  /**
   * Generate Edwards curve key pair (Ed25519).
   * PKCS#11: CKM_EC_EDWARDS_KEY_PAIR_GEN
   */
  generateEdKeyPair(curve: EdCurve): Promise<KeyGenerationResult>;

  /**
   * Generate RSA key pair (2048 or 4096 bits).
   * PKCS#11: CKM_RSA_PKCS_KEY_PAIR_GEN
   */
  generateRsaKeyPair(bits: RsaKeySize): Promise<KeyGenerationResult>;

  // ---------------------------------------------------------------------------
  // Symmetric Key Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate AES key (128 or 256 bits).
   * PKCS#11: CKM_AES_KEY_GEN
   * @returns Opaque handle for the generated key
   */
  generateAesKey(bits: AesKeySize): Promise<string>;

  // ---------------------------------------------------------------------------
  // Signing Operations
  // ---------------------------------------------------------------------------

  /**
   * Sign data using the specified algorithm.
   * PKCS#11: CKM_ECDSA_SHA256, CKM_EDDSA, CKM_RSA_PKCS_PSS, etc.
   */
  sign(
    keyHandle: string,
    algorithm: SigningAlgorithm,
    data: Buffer,
  ): Promise<Buffer>;

  /**
   * Verify signature using the specified algorithm.
   */
  verify(
    keyHandle: string,
    algorithm: SigningAlgorithm,
    data: Buffer,
    signature: Buffer,
  ): Promise<boolean>;

  // ---------------------------------------------------------------------------
  // Key Export
  // ---------------------------------------------------------------------------

  /**
   * Export public key in PEM format (SPKI).
   * Private keys are never exported from HSM.
   */
  exportPublicKey(keyHandle: string): Promise<string>;

  // ---------------------------------------------------------------------------
  // Key Wrapping (Envelope Encryption)
  // ---------------------------------------------------------------------------

  /**
   * Wrap a DEK using a KEK with AES-GCM.
   * PKCS#11: CKM_AES_GCM
   */
  wrapKey(dekBytes: Buffer, kekHandle: string): Promise<WrapKeyResult>;

  /**
   * Unwrap a DEK using a KEK with AES-GCM.
   * PKCS#11: CKM_AES_GCM
   */
  unwrapKey(
    wrappedDek: Buffer,
    iv: Buffer,
    authTag: Buffer,
    kekHandle: string,
  ): Promise<Buffer>;

  // ---------------------------------------------------------------------------
  // Key Management (Optional)
  // ---------------------------------------------------------------------------

  /**
   * Destroy a key by handle.
   * PKCS#11: C_DestroyObject
   */
  destroyKey?(handle: string): Promise<void>;

  /**
   * Check if a key exists by handle.
   */
  hasKey?(handle: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// HSM Crypto Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the software simulator backend.
 */
export interface SimulatorCryptoConfig {
  type: "simulator";
}

/**
 * Configuration for real PKCS#11 hardware HSM backend.
 *
 * Security: Never hardcode PINs — use environment variables or secret managers.
 */
export interface Pkcs11CryptoConfig {
  type: "pkcs11";
  /**
   * Path to the PKCS#11 library (.so on Linux, .dll on Windows, .dylib on macOS).
   *
   * Examples:
   * - Thales nShield: /opt/nfast/toolkits/pkcs11/libcknfast.so
   * - Utimaco: /opt/utimaco/lib/libcs2_pkcs11.so
   * - SafeNet Luna: /usr/safenet/lunaclient/lib/libCryptoki2.so
   * - AWS CloudHSM: /opt/cloudhsm/lib/libcloudhsm_pkcs11.so
   * - SoftHSM2: /usr/lib/softhsm/libsofthsm2.so
   */
  libraryPath: string;
  /**
   * Slot index to use. Default: 0
   * Mutually exclusive with tokenLabel.
   */
  slotIndex?: number;
  /**
   * Token label to find the slot. Takes precedence over slotIndex.
   * Useful when slot indices change between restarts.
   */
  tokenLabel?: string;
  /**
   * User PIN for login (CKU_USER).
   * Security: Use process.env.HSM_USER_PIN instead of hardcoding.
   */
  userPin: string;
  /**
   * Security Officer PIN (CKU_SO). Optional, used for token initialization.
   */
  soPin?: string;
  /**
   * Open read-only session. Default: false (read-write).
   * Use true when only signing/verification is needed.
   */
  readOnly?: boolean;
}

/**
 * Union type for HSM crypto configuration.
 */
export type HsmCryptoConfig = SimulatorCryptoConfig | Pkcs11CryptoConfig;
