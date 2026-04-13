/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Simulator Crypto Adapter
 *
 * Software implementation of HsmCryptoPort using node:crypto.
 * Provides full key suite support: EC P-256/P-384, Ed25519, RSA-2048/4096, AES-128/256.
 *
 * This adapter is used for development and testing. For production,
 * use Pkcs11CryptoAdapter with real hardware HSM.
 *
 * SECURITY: Private keys are stored in memory. In production, keys should
 * never leave hardware-protected storage.
 */

import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

import type {
  AesKeySize,
  EcCurve,
  EdCurve,
  HsmCryptoConfig,
  HsmCryptoPort,
  KeyGenerationResult,
  RsaKeySize,
  SigningAlgorithm,
  WrapKeyResult,
} from "../../domain/ports";

/**
 * Internal key storage for simulator.
 */
interface SimulatorKeyEntry {
  type: "ec" | "ed" | "rsa" | "aes";
  privateKeyPem?: string;
  publicKeyPem?: string;
  keyBytes?: Buffer;
  curve?: EcCurve | EdCurve;
  rsaBits?: RsaKeySize;
  aesBits?: AesKeySize;
}

/**
 * Software HSM simulator using node:crypto.
 *
 * Supports:
 * - EC P-256, P-384 key generation and ECDSA signing
 * - Ed25519 key generation and EdDSA signing
 * - RSA-2048, RSA-4096 key generation and RSA-PSS/PKCS1 signing
 * - AES-128, AES-256 key generation and GCM wrapping
 */
export class SimulatorCryptoAdapter implements HsmCryptoPort {
  private keys = new Map<string, SimulatorKeyEntry>();
  private handleCounter = 0;
  private initialized = false;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(config: HsmCryptoConfig): Promise<void> {
    if (config.type !== "simulator") {
      throw new Error("SimulatorCryptoAdapter requires type: 'simulator'");
    }
    this.initialized = true;
  }

  async finalize(): Promise<void> {
    // Zeroize all key material
    for (const [, entry] of this.keys) {
      if (entry.keyBytes) {
        entry.keyBytes.fill(0);
      }
      // Note: We can't truly zeroize PEM strings, but we clear references
      if (entry.privateKeyPem) {
        entry.privateKeyPem = "";
      }
    }
    this.keys.clear();
    this.initialized = false;
  }

  // ---------------------------------------------------------------------------
  // Asymmetric Key Generation
  // ---------------------------------------------------------------------------

  async generateEcKeyPair(curve: EcCurve): Promise<KeyGenerationResult> {
    this.assertInitialized();

    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: curve,
    });

    const handle = `sim:ec:${++this.handleCounter}`;
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    this.keys.set(handle, {
      type: "ec",
      privateKeyPem,
      publicKeyPem,
      curve,
    });

    return { handle, publicKeyPem };
  }

  async generateEdKeyPair(curve: EdCurve): Promise<KeyGenerationResult> {
    this.assertInitialized();

    if (curve !== "Ed25519") {
      throw new Error(`Unsupported Edwards curve: ${curve}`);
    }

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const handle = `sim:ed:${++this.handleCounter}`;
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    this.keys.set(handle, {
      type: "ed",
      privateKeyPem,
      publicKeyPem,
      curve,
    });

    return { handle, publicKeyPem };
  }

  async generateRsaKeyPair(bits: RsaKeySize): Promise<KeyGenerationResult> {
    this.assertInitialized();

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: bits,
      publicExponent: 65537,
    });

    const handle = `sim:rsa:${++this.handleCounter}`;
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    }) as string;
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }) as string;

    this.keys.set(handle, {
      type: "rsa",
      privateKeyPem,
      publicKeyPem,
      rsaBits: bits,
    });

    return { handle, publicKeyPem };
  }

  // ---------------------------------------------------------------------------
  // Symmetric Key Generation
  // ---------------------------------------------------------------------------

  async generateAesKey(bits: AesKeySize): Promise<string> {
    this.assertInitialized();

    const keyBytes = randomBytes(bits / 8);
    const handle = `sim:aes:${++this.handleCounter}`;

    this.keys.set(handle, {
      type: "aes",
      keyBytes,
      aesBits: bits,
    });

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

    const entry = this.requireKey(keyHandle);

    if (!entry.privateKeyPem) {
      throw new Error(`Key ${keyHandle} has no private key material`);
    }

    const privateKey = createPrivateKey(entry.privateKeyPem);

    switch (algorithm) {
      case "ecdsa-sha256": {
        this.assertKeyType(entry, "ec", keyHandle);
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer.sign(privateKey);
      }

      case "ecdsa-sha384": {
        this.assertKeyType(entry, "ec", keyHandle);
        const signer = createSign("SHA384");
        signer.update(data);
        signer.end();
        return signer.sign(privateKey);
      }

      case "ed25519": {
        this.assertKeyType(entry, "ed", keyHandle);
        // Ed25519 uses crypto.sign() directly, not createSign()
        return sign(null, data, privateKey);
      }

      case "rsa-pss-sha256": {
        this.assertKeyType(entry, "rsa", keyHandle);
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer.sign({
          key: privateKey,
          padding: 6, // RSA_PKCS1_PSS_PADDING
          saltLength: 32,
        });
      }

      case "rsa-pkcs1-sha256": {
        this.assertKeyType(entry, "rsa", keyHandle);
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer.sign({
          key: privateKey,
          padding: 1, // RSA_PKCS1_PADDING
        });
      }

      default:
        throw new Error(`Unsupported signing algorithm: ${algorithm}`);
    }
  }

  async verify(
    keyHandle: string,
    algorithm: SigningAlgorithm,
    data: Buffer,
    signature: Buffer,
  ): Promise<boolean> {
    this.assertInitialized();

    const entry = this.requireKey(keyHandle);

    if (!entry.publicKeyPem) {
      throw new Error(`Key ${keyHandle} has no public key material`);
    }

    const publicKey = createPublicKey(entry.publicKeyPem);

    switch (algorithm) {
      case "ecdsa-sha256": {
        this.assertKeyType(entry, "ec", keyHandle);
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, signature);
      }

      case "ecdsa-sha384": {
        this.assertKeyType(entry, "ec", keyHandle);
        const verifier = createVerify("SHA384");
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, signature);
      }

      case "ed25519": {
        this.assertKeyType(entry, "ed", keyHandle);
        // Ed25519 uses crypto.verify() directly, not createVerify()
        return verify(null, data, publicKey, signature);
      }

      case "rsa-pss-sha256": {
        this.assertKeyType(entry, "rsa", keyHandle);
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify(
          {
            key: publicKey,
            padding: 6, // RSA_PKCS1_PSS_PADDING
            saltLength: 32,
          },
          signature,
        );
      }

      case "rsa-pkcs1-sha256": {
        this.assertKeyType(entry, "rsa", keyHandle);
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify(
          {
            key: publicKey,
            padding: 1, // RSA_PKCS1_PADDING
          },
          signature,
        );
      }

      default:
        throw new Error(`Unsupported verification algorithm: ${algorithm}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Key Export
  // ---------------------------------------------------------------------------

  async exportPublicKey(keyHandle: string): Promise<string> {
    this.assertInitialized();

    const entry = this.requireKey(keyHandle);

    if (!entry.publicKeyPem) {
      throw new Error(`Key ${keyHandle} has no public key`);
    }

    return entry.publicKeyPem;
  }

  // ---------------------------------------------------------------------------
  // Key Wrapping (Envelope Encryption)
  // ---------------------------------------------------------------------------

  async wrapKey(dekBytes: Buffer, kekHandle: string): Promise<WrapKeyResult> {
    this.assertInitialized();

    const entry = this.requireKey(kekHandle);
    this.assertKeyType(entry, "aes", kekHandle);

    if (!entry.keyBytes) {
      throw new Error(`Key ${kekHandle} has no key material`);
    }

    const kekBuffer = Buffer.from(entry.keyBytes);
    const iv = randomBytes(12);
    // Select algorithm based on key size
    const algorithm = entry.aesBits === 128 ? "aes-128-gcm" : "aes-256-gcm";

    try {
      const cipher = createCipheriv(algorithm, kekBuffer, iv);
      const wrappedDek = Buffer.concat([
        cipher.update(dekBytes),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return { wrappedDek, iv, authTag };
    } finally {
      // Zeroize the ephemeral KEK copy
      kekBuffer.fill(0);
    }
  }

  async unwrapKey(
    wrappedDek: Buffer,
    iv: Buffer,
    authTag: Buffer,
    kekHandle: string,
  ): Promise<Buffer> {
    this.assertInitialized();

    const entry = this.requireKey(kekHandle);
    this.assertKeyType(entry, "aes", kekHandle);

    if (!entry.keyBytes) {
      throw new Error(`Key ${kekHandle} has no key material`);
    }

    const kekBuffer = Buffer.from(entry.keyBytes);
    // Select algorithm based on key size
    const algorithm = entry.aesBits === 128 ? "aes-128-gcm" : "aes-256-gcm";

    try {
      const decipher = createDecipheriv(algorithm, kekBuffer, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(wrappedDek), decipher.final()]);
    } catch {
      throw new Error("Key unwrap failed: GCM authentication failed");
    } finally {
      // Zeroize the ephemeral KEK copy
      kekBuffer.fill(0);
    }
  }

  // ---------------------------------------------------------------------------
  // Key Management
  // ---------------------------------------------------------------------------

  async destroyKey(handle: string): Promise<void> {
    this.assertInitialized();

    const entry = this.keys.get(handle);
    if (entry) {
      // Zeroize key material before deletion
      if (entry.keyBytes) {
        entry.keyBytes.fill(0);
      }
      this.keys.delete(handle);
    }
  }

  async hasKey(handle: string): Promise<boolean> {
    return this.keys.has(handle);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new Error("SimulatorCryptoAdapter not initialized");
    }
  }

  private requireKey(handle: string): SimulatorKeyEntry {
    const entry = this.keys.get(handle);
    if (!entry) {
      throw new Error(`Key not found: ${handle}`);
    }
    return entry;
  }

  private assertKeyType(
    entry: SimulatorKeyEntry,
    expectedType: SimulatorKeyEntry["type"],
    handle: string,
  ): void {
    if (entry.type !== expectedType) {
      throw new Error(
        `Key ${handle} is type '${entry.type}', expected '${expectedType}'`,
      );
    }
  }
}
