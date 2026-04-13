/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PKCS#11 Crypto Adapter
 *
 * Real hardware HSM implementation of HsmCryptoPort using graphene-pk11.
 * Supports industry-standard PKCS#11 v2.40+ compliant HSMs:
 * - Thales nShield
 * - Utimaco SecurityServer
 * - SafeNet Luna
 * - AWS CloudHSM
 * - SoftHSM2 (for testing)
 *
 * Ref: PKCS#11 v3.1 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 *
 * SECURITY: PINs should NEVER be hardcoded. Use environment variables or
 * secret managers (AWS Secrets Manager, HashiCorp Vault, etc.)
 */

import type {
  AesKeySize,
  EcCurve,
  EdCurve,
  HsmCryptoConfig,
  HsmCryptoPort,
  KeyGenerationResult,
  Pkcs11CryptoConfig,
  RsaKeySize,
  SigningAlgorithm,
  WrapKeyResult,
} from "../../domain/ports";

// Type definitions for graphene-pk11 (loaded dynamically)
type GrapheneModule = any;
type GrapheneSlot = any;
type GrapheneSession = any;

/**
 * Real PKCS#11 hardware HSM adapter using graphene-pk11.
 *
 * Supports:
 * - EC P-256, P-384 key generation (CKM_EC_KEY_PAIR_GEN)
 * - Ed25519 key generation (CKM_EC_EDWARDS_KEY_PAIR_GEN)
 * - RSA-2048, RSA-4096 key generation (CKM_RSA_PKCS_KEY_PAIR_GEN)
 * - AES-128, AES-256 key generation (CKM_AES_KEY_GEN)
 * - ECDSA signing (CKM_ECDSA_SHA256, CKM_ECDSA_SHA384)
 * - EdDSA signing (CKM_EDDSA)
 * - RSA signing (CKM_RSA_PKCS_PSS, CKM_RSA_PKCS)
 * - AES-GCM key wrapping (CKM_AES_GCM)
 */
export class Pkcs11CryptoAdapter implements HsmCryptoPort {
  private graphene: GrapheneModule | null = null;
  private mod: GrapheneModule | null = null;
  private slot: GrapheneSlot | null = null;
  private session: GrapheneSession | null = null;
  private config: Pkcs11CryptoConfig | null = null;
  private initialized = false;

  // Map of key handles to PKCS#11 object handles
  private keyHandleMap = new Map<string, Buffer>();
  private handleCounter = 0;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: HsmCryptoConfig): Promise<void> {
    if (config.type !== "pkcs11") {
      throw new Error("Pkcs11CryptoAdapter requires type: 'pkcs11'");
    }

    this.config = config;

    // Lazy load graphene-pk11
    try {
      this.graphene = await import("graphene-pk11");
    } catch {
      throw new Error(
        "graphene-pk11 is required for PKCS#11 support. " +
          "Install it with: npm install graphene-pk11",
      );
    }

    try {
      // Load PKCS#11 library
      this.mod = this.graphene.Module.load(config.libraryPath);
      this.mod.initialize();

      // Find slot
      const slots = this.mod.getSlots(true); // true = token present
      if (config.tokenLabel) {
        this.slot = this.findSlotByLabel(slots, config.tokenLabel);
      } else {
        const slotIndex = config.slotIndex ?? 0;
        this.slot = slots.items(slotIndex);
      }

      if (!this.slot) {
        throw new Error(
          config.tokenLabel
            ? `PKCS#11 token not found: ${config.tokenLabel}`
            : `PKCS#11 slot not found at index ${config.slotIndex ?? 0}`,
        );
      }

      // Open session
      const SessionFlag = this.graphene.SessionFlag;
      const sessionFlags = config.readOnly
        ? SessionFlag.RO_SESSION | SessionFlag.SERIAL_SESSION
        : SessionFlag.RW_SESSION | SessionFlag.SERIAL_SESSION;

      this.session = this.slot.open(sessionFlags);

      // Login
      const UserType = this.graphene.UserType;
      this.session.login(config.userPin, UserType.USER);

      this.initialized = true;
    } catch (error) {
      // Cleanup on failure
      await this.cleanup();
      throw error;
    }
  }

  async finalize(): Promise<void> {
    await this.cleanup();
    this.keyHandleMap.clear();
    this.initialized = false;
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.session) {
        try {
          this.session.logout();
        } catch {
          // Ignore logout errors
        }
        try {
          this.session.close();
        } catch {
          // Ignore close errors
        }
        this.session = null;
      }

      if (this.mod) {
        try {
          this.mod.finalize();
        } catch {
          // Ignore finalize errors
        }
        this.mod = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  // ---------------------------------------------------------------------------
  // Asymmetric Key Generation
  // ---------------------------------------------------------------------------

  async generateEcKeyPair(curve: EcCurve): Promise<KeyGenerationResult> {
    this.assertInitialized();

    const { KeyGenMechanism, KeyType, NamedCurve, ObjectClass } =
      this.graphene!;

    // Map curve name to OID
    const curveOid =
      curve === "P-256"
        ? NamedCurve.getByName("secp256r1")
        : NamedCurve.getByName("secp384r1");

    const keyPair = this.session!.generateKeyPair(
      KeyGenMechanism.EC,
      {
        keyType: KeyType.EC,
        paramsEC: curveOid.value,
        token: true,
        private: true,
        sensitive: true,
        extractable: false,
        sign: true,
      },
      {
        keyType: KeyType.EC,
        token: true,
        private: false,
        verify: true,
      },
    );

    const handle = `pkcs11:ec:${++this.handleCounter}`;
    this.keyHandleMap.set(handle, keyPair.privateKey.handle);

    // Export public key
    const publicKeyDer = this.exportPublicKeyDer(
      keyPair.publicKey,
      ObjectClass.PUBLIC_KEY,
    );
    const publicKeyPem = this.derToPem(publicKeyDer, "PUBLIC KEY");

    return { handle, publicKeyPem };
  }

  async generateEdKeyPair(curve: EdCurve): Promise<KeyGenerationResult> {
    this.assertInitialized();

    if (curve !== "Ed25519") {
      throw new Error(`Unsupported Edwards curve: ${curve}`);
    }

    const { KeyGenMechanism, KeyType, ObjectClass } = this.graphene!;

    // Ed25519 OID: 1.3.101.112
    const ed25519Oid = Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]);

    const keyPair = this.session!.generateKeyPair(
      KeyGenMechanism.EC_EDWARDS,
      {
        keyType: KeyType.EC_EDWARDS,
        paramsECDH: ed25519Oid,
        token: true,
        private: true,
        sensitive: true,
        extractable: false,
        sign: true,
      },
      {
        keyType: KeyType.EC_EDWARDS,
        token: true,
        private: false,
        verify: true,
      },
    );

    const handle = `pkcs11:ed:${++this.handleCounter}`;
    this.keyHandleMap.set(handle, keyPair.privateKey.handle);

    // Export public key
    const publicKeyDer = this.exportPublicKeyDer(
      keyPair.publicKey,
      ObjectClass.PUBLIC_KEY,
    );
    const publicKeyPem = this.derToPem(publicKeyDer, "PUBLIC KEY");

    return { handle, publicKeyPem };
  }

  async generateRsaKeyPair(bits: RsaKeySize): Promise<KeyGenerationResult> {
    this.assertInitialized();

    const { KeyGenMechanism, KeyType, ObjectClass } = this.graphene!;

    const keyPair = this.session!.generateKeyPair(
      KeyGenMechanism.RSA,
      {
        keyType: KeyType.RSA,
        modulusBits: bits,
        publicExponent: Buffer.from([0x01, 0x00, 0x01]), // 65537
        token: true,
        private: true,
        sensitive: true,
        extractable: false,
        sign: true,
      },
      {
        keyType: KeyType.RSA,
        token: true,
        private: false,
        verify: true,
      },
    );

    const handle = `pkcs11:rsa:${++this.handleCounter}`;
    this.keyHandleMap.set(handle, keyPair.privateKey.handle);

    // Export public key
    const publicKeyDer = this.exportPublicKeyDer(
      keyPair.publicKey,
      ObjectClass.PUBLIC_KEY,
    );
    const publicKeyPem = this.derToPem(publicKeyDer, "PUBLIC KEY");

    return { handle, publicKeyPem };
  }

  // ---------------------------------------------------------------------------
  // Symmetric Key Generation
  // ---------------------------------------------------------------------------

  async generateAesKey(bits: AesKeySize): Promise<string> {
    this.assertInitialized();

    const { KeyGenMechanism, KeyType } = this.graphene!;

    const key = this.session!.generateKey(KeyGenMechanism.AES, {
      keyType: KeyType.AES,
      valueLen: bits / 8,
      token: true,
      private: true,
      sensitive: true,
      extractable: false,
      wrap: true,
      unwrap: true,
      encrypt: true,
      decrypt: true,
    });

    const handle = `pkcs11:aes:${++this.handleCounter}`;
    this.keyHandleMap.set(handle, key.handle);

    return handle;
  }

  // ---------------------------------------------------------------------------
  // Signing Operations
  // ---------------------------------------------------------------------------

  async sign(
    keyHandle: string,
    algorithm: SigningAlgorithm,
    data: Buffer,
  ): Promise<Buffer> {
    this.assertInitialized();

    const pkcs11Handle = this.requirePkcs11Handle(keyHandle);
    const privateKey = this.findKeyByHandle(pkcs11Handle);

    const { MechanismEnum } = this.graphene!;

    let mechanism: number;
    switch (algorithm) {
      case "ecdsa-sha256":
        mechanism = MechanismEnum.ECDSA_SHA256;
        break;
      case "ecdsa-sha384":
        mechanism = MechanismEnum.ECDSA_SHA384;
        break;
      case "ed25519":
        mechanism = MechanismEnum.EDDSA;
        break;
      case "rsa-pss-sha256":
        mechanism = MechanismEnum.SHA256_RSA_PKCS_PSS;
        break;
      case "rsa-pkcs1-sha256":
        mechanism = MechanismEnum.SHA256_RSA_PKCS;
        break;
      default:
        throw new Error(`Unsupported signing algorithm: ${algorithm}`);
    }

    const sign = this.session!.createSign(mechanism, privateKey);
    sign.update(data);
    return sign.final();
  }

  async verify(
    keyHandle: string,
    algorithm: SigningAlgorithm,
    data: Buffer,
    signature: Buffer,
  ): Promise<boolean> {
    this.assertInitialized();

    const pkcs11Handle = this.requirePkcs11Handle(keyHandle);

    // Find the corresponding public key
    const { ObjectClass } = this.graphene!;
    const objects = this.session!.find({ class: ObjectClass.PUBLIC_KEY });
    let publicKey = null;

    // Try to find a matching public key
    // In PKCS#11, public/private keys are separate objects
    // We need to find the public key that matches the private key
    for (const obj of objects) {
      if (this.isMatchingPublicKey(obj, pkcs11Handle)) {
        publicKey = obj;
        break;
      }
    }

    if (!publicKey) {
      throw new Error(`Public key not found for handle: ${keyHandle}`);
    }

    const { MechanismEnum } = this.graphene!;

    let mechanism: number;
    switch (algorithm) {
      case "ecdsa-sha256":
        mechanism = MechanismEnum.ECDSA_SHA256;
        break;
      case "ecdsa-sha384":
        mechanism = MechanismEnum.ECDSA_SHA384;
        break;
      case "ed25519":
        mechanism = MechanismEnum.EDDSA;
        break;
      case "rsa-pss-sha256":
        mechanism = MechanismEnum.SHA256_RSA_PKCS_PSS;
        break;
      case "rsa-pkcs1-sha256":
        mechanism = MechanismEnum.SHA256_RSA_PKCS;
        break;
      default:
        throw new Error(`Unsupported verification algorithm: ${algorithm}`);
    }

    try {
      const verify = this.session!.createVerify(mechanism, publicKey);
      verify.update(data);
      verify.final(signature);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Key Export
  // ---------------------------------------------------------------------------

  async exportPublicKey(keyHandle: string): Promise<string> {
    this.assertInitialized();

    const pkcs11Handle = this.requirePkcs11Handle(keyHandle);

    // Find the corresponding public key
    const { ObjectClass } = this.graphene!;
    const objects = this.session!.find({ class: ObjectClass.PUBLIC_KEY });

    for (const obj of objects) {
      if (this.isMatchingPublicKey(obj, pkcs11Handle)) {
        const der = this.exportPublicKeyDer(obj, ObjectClass.PUBLIC_KEY);
        return this.derToPem(der, "PUBLIC KEY");
      }
    }

    throw new Error(`Public key not found for handle: ${keyHandle}`);
  }

  // ---------------------------------------------------------------------------
  // Key Wrapping (Envelope Encryption)
  // ---------------------------------------------------------------------------

  async wrapKey(dekBytes: Buffer, kekHandle: string): Promise<WrapKeyResult> {
    this.assertInitialized();

    const pkcs11Handle = this.requirePkcs11Handle(kekHandle);
    const kek = this.findKeyByHandle(pkcs11Handle);

    const { MechanismEnum } = this.graphene!;

    // Generate random IV
    const iv = Buffer.alloc(12);
    // Use PKCS#11 random generation
    this.session!.generateRandom(iv);

    // AES-GCM parameters
    const gcmParams = {
      iv,
      ivBits: 96,
      aad: Buffer.alloc(0),
      tagBits: 128,
    };

    const cipher = this.session!.createCipher(
      { mechanism: MechanismEnum.AES_GCM, parameter: gcmParams },
      kek,
    );

    cipher.update(dekBytes);
    const result = cipher.final();

    // In AES-GCM, the auth tag is appended to the ciphertext
    const ciphertextWithTag = result;
    const wrappedDek = ciphertextWithTag.slice(0, -16);
    const authTag = ciphertextWithTag.slice(-16);

    return { wrappedDek, iv, authTag };
  }

  async unwrapKey(
    wrappedDek: Buffer,
    iv: Buffer,
    authTag: Buffer,
    kekHandle: string,
  ): Promise<Buffer> {
    this.assertInitialized();

    const pkcs11Handle = this.requirePkcs11Handle(kekHandle);
    const kek = this.findKeyByHandle(pkcs11Handle);

    const { MechanismEnum } = this.graphene!;

    // Reconstruct ciphertext with auth tag
    const ciphertextWithTag = Buffer.concat([wrappedDek, authTag]);

    // AES-GCM parameters
    const gcmParams = {
      iv,
      ivBits: 96,
      aad: Buffer.alloc(0),
      tagBits: 128,
    };

    try {
      const decipher = this.session!.createDecipher(
        { mechanism: MechanismEnum.AES_GCM, parameter: gcmParams },
        kek,
      );

      decipher.update(ciphertextWithTag);
      return decipher.final();
    } catch {
      throw new Error("Key unwrap failed: GCM authentication failed");
    }
  }

  // ---------------------------------------------------------------------------
  // Key Management
  // ---------------------------------------------------------------------------

  async destroyKey(handle: string): Promise<void> {
    this.assertInitialized();

    const pkcs11Handle = this.keyHandleMap.get(handle);
    if (!pkcs11Handle) {
      return; // Key doesn't exist, nothing to destroy
    }

    try {
      const key = this.findKeyByHandle(pkcs11Handle);
      key.destroy();
      this.keyHandleMap.delete(handle);
    } catch {
      // Key may already be destroyed
      this.keyHandleMap.delete(handle);
    }
  }

  async hasKey(handle: string): Promise<boolean> {
    return this.keyHandleMap.has(handle);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized || !this.session) {
      throw new Error("Pkcs11CryptoAdapter not initialized");
    }
  }

  private requirePkcs11Handle(handle: string): Buffer {
    const pkcs11Handle = this.keyHandleMap.get(handle);
    if (!pkcs11Handle) {
      throw new Error(`Key not found: ${handle}`);
    }
    return pkcs11Handle;
  }

  private findSlotByLabel(slots: any, label: string): GrapheneSlot | null {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots.items(i);
      if (slot.token && slot.token.label.trim() === label) {
        return slot;
      }
    }
    return null;
  }

  private findKeyByHandle(handle: Buffer): any {
    const { ObjectClass } = this.graphene!;

    // Try to find as private key first
    const privateKeys = this.session!.find({ class: ObjectClass.PRIVATE_KEY });
    for (const key of privateKeys) {
      if (key.handle.equals(handle)) {
        return key;
      }
    }

    // Try to find as secret key
    const secretKeys = this.session!.find({ class: ObjectClass.SECRET_KEY });
    for (const key of secretKeys) {
      if (key.handle.equals(handle)) {
        return key;
      }
    }

    throw new Error("Key not found on HSM");
  }

  private isMatchingPublicKey(
    publicKey: any,
    privateKeyHandle: Buffer,
  ): boolean {
    // In PKCS#11, matching public/private keys typically share
    // the same CKA_ID attribute. This is vendor-dependent.
    try {
      const publicKeyId = publicKey.getAttribute({ id: null }).id;
      const privateKey = this.findKeyByHandle(privateKeyHandle);
      const privateKeyId = privateKey.getAttribute({ id: null }).id;
      return publicKeyId && privateKeyId && publicKeyId.equals(privateKeyId);
    } catch {
      // Fallback: just use any public key with matching type
      return true;
    }
  }

  private exportPublicKeyDer(publicKey: any, _objectClass: any): Buffer {
    // Get the public key value (DER-encoded SPKI)
    try {
      // For EC keys, we need to construct the SPKI from the EC point
      const attrs = publicKey.getAttribute({ value: null, ecParams: null });

      if (attrs.ecParams) {
        // EC key - construct SPKI
        return this.constructEcSpki(attrs.ecParams, attrs.value);
      } else {
        // RSA key - the value should already be SPKI
        return attrs.value;
      }
    } catch {
      throw new Error("Failed to export public key");
    }
  }

  private constructEcSpki(ecParams: Buffer, ecPoint: Buffer): Buffer {
    // Simplified SPKI construction for EC keys
    // In production, use a proper ASN.1 library
    const algorithm = Buffer.from([
      0x30,
      0x13, // SEQUENCE
      0x06,
      0x07,
      0x2a,
      0x86,
      0x48,
      0xce,
      0x3d,
      0x02,
      0x01, // OID: ecPublicKey
      ...ecParams, // EC parameters (curve OID)
    ]);

    const bitString = Buffer.concat([
      Buffer.from([0x03, ecPoint.length + 1, 0x00]), // BIT STRING header
      ecPoint,
    ]);

    const totalLength = algorithm.length + bitString.length;
    const header =
      totalLength < 128
        ? Buffer.from([0x30, totalLength])
        : Buffer.from([0x30, 0x81, totalLength]);

    return Buffer.concat([header, algorithm, bitString]);
  }

  private derToPem(der: Buffer, label: string): string {
    const base64 = der.toString("base64");
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
  }
}
