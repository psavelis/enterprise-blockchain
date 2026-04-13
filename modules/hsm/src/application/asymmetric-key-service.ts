/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

import { sha256hex } from "../../../shared/src/crypto";
import type {
  AsymmetricKeyEntry,
  HsmKeyPair,
  HsmKeyType,
  HsmNamedCurve,
  HsmSignatureAlgorithm,
  HsmSignatureResult,
} from "../domain/entities";
import type {
  AuditLog,
  EcCurve,
  EdCurve,
  HsmCryptoPort,
  KeyStore,
  RsaKeySize,
  SigningAlgorithm,
} from "../domain/ports";

/**
 * Options for key generation.
 */
export interface KeyGenOptions {
  /** Key type: EC, Ed, or RSA */
  keyType?: HsmKeyType;
  /** Named curve for EC/Ed keys */
  namedCurve?: HsmNamedCurve;
  /** RSA key size in bits */
  rsaBits?: 2048 | 4096;
}

/**
 * Asymmetric key operations — signing, verification, key export.
 *
 * Supports:
 * - EC P-256, P-384 (ECDSA-SHA256, ECDSA-SHA384)
 * - Ed25519 (EdDSA)
 * - RSA-2048, RSA-4096 (RSA-PSS-SHA256, RSA-PKCS1-SHA256)
 *
 * Mirrors PKCS#11 mechanisms:
 * - CKM_EC_KEY_PAIR_GEN, CKM_EC_EDWARDS_KEY_PAIR_GEN, CKM_RSA_PKCS_KEY_PAIR_GEN
 * - CKM_ECDSA_SHA256, CKM_ECDSA_SHA384, CKM_EDDSA, CKM_RSA_PKCS_PSS, CKM_RSA_PKCS
 *
 * Ref: PKCS#11 v3.1 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 */
export class AsymmetricKeyService {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly audit: AuditLog,
    private readonly slotId: string,
    /** Optional crypto port for hardware HSM support */
    private readonly crypto?: HsmCryptoPort,
  ) {}

  // ---------------------------------------------------------------------------
  // Synchronous Methods (Backward Compatible - Simulator Only)
  // ---------------------------------------------------------------------------

  /**
   * Generate EC P-256 key pair (synchronous, simulator only).
   * For hardware HSM support, use generateKeyPairAsync().
   */
  generateKeyPair(keyLabel: string): HsmKeyPair {
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const createdAt = new Date().toISOString();
    const handle = `hsm:${this.slotId}:${keyLabel}:${randomBytes(8).toString("hex")}`;

    // Export to PEM for storage (domain stays infrastructure-agnostic)
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    });
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    });

    // Type guard: PEM format always returns string
    if (typeof privateKeyPem !== "string" || typeof publicKeyPem !== "string") {
      throw new Error("HSM: unexpected binary output from PEM export");
    }

    this.keyStore.set(keyLabel, {
      kind: "asymmetric",
      keyLabel,
      handle,
      privateKeyPem,
      publicKeyPem,
      keyType: "EC",
      namedCurve: "P-256",
      createdAt,
    });

    this.audit.record("generateKeyPair", keyLabel, "success");

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
   * Sign data with EC P-256 key (synchronous, simulator only).
   * For hardware HSM support, use signAsync().
   */
  sign(keyLabel: string, data: string): HsmSignatureResult {
    const entry = this.requireAsymmetric(keyLabel);
    const timestamp = new Date().toISOString();

    // Convert PEM back to KeyObject for signing
    const privateKey = createPrivateKey(entry.privateKeyPem);

    const signer = createSign("SHA256");
    signer.update(data);
    signer.end();
    const signature = signer.sign(privateKey).toString("hex");

    const hsmAttestation = sha256hex(
      `${this.slotId}:${keyLabel}:${timestamp}:${signature}`,
    );

    this.audit.record("sign", keyLabel, "success");

    return {
      keyLabel,
      algorithm: "ecdsa-sha256",
      signature,
      publicKeyPem: entry.publicKeyPem,
      timestamp,
      hsmAttestation,
    };
  }

  /**
   * Verify signature (synchronous, simulator only).
   * For hardware HSM support, use verifyAsync().
   */
  verify(keyLabel: string, data: string, signature: string): boolean {
    const entry = this.requireAsymmetric(keyLabel);

    // Convert PEM back to KeyObject for verification
    const publicKey = createPublicKey(entry.publicKeyPem);

    const verifier = createVerify("SHA256");
    verifier.update(data);
    verifier.end();
    const valid = verifier.verify(publicKey, Buffer.from(signature, "hex"));

    this.audit.record(
      "verify",
      keyLabel,
      "success",
      valid ? "valid" : "invalid",
    );
    return valid;
  }

  /**
   * Export public key (synchronous).
   */
  exportPublicKey(keyLabel: string): string {
    const entry = this.requireAsymmetric(keyLabel);
    this.audit.record("exportPublicKey", keyLabel, "success");
    return entry.publicKeyPem;
  }

  // ---------------------------------------------------------------------------
  // Asynchronous Methods (Hardware HSM Support)
  // ---------------------------------------------------------------------------

  /**
   * Generate key pair asynchronously.
   * Supports EC P-256, P-384, Ed25519, RSA-2048, RSA-4096.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   */
  async generateKeyPairAsync(
    keyLabel: string,
    options?: KeyGenOptions,
  ): Promise<HsmKeyPair> {
    if (this.keyStore.has(keyLabel)) {
      throw new Error(`HSM key already exists: ${keyLabel}`);
    }

    const keyType = options?.keyType ?? "EC";
    const namedCurve = options?.namedCurve ?? "P-256";
    const rsaBits = options?.rsaBits ?? 4096;

    const createdAt = new Date().toISOString();
    let handle: string;
    let publicKeyPem: string;
    let privateKeyPem = "";

    if (this.crypto) {
      // Use hardware HSM
      let result;
      switch (keyType) {
        case "EC":
          result = await this.crypto.generateEcKeyPair(namedCurve as EcCurve);
          break;
        case "Ed":
          result = await this.crypto.generateEdKeyPair(namedCurve as EdCurve);
          break;
        case "RSA":
          result = await this.crypto.generateRsaKeyPair(rsaBits as RsaKeySize);
          break;
        default:
          throw new Error(`Unsupported key type: ${keyType}`);
      }
      handle = result.handle;
      publicKeyPem = result.publicKeyPem;
    } else {
      // Fall back to simulator
      if (keyType === "EC") {
        const { privateKey, publicKey } = generateKeyPairSync("ec", {
          namedCurve: namedCurve,
        });
        handle = `sim:ec:${randomBytes(8).toString("hex")}`;
        publicKeyPem = publicKey.export({
          type: "spki",
          format: "pem",
        }) as string;
        privateKeyPem = privateKey.export({
          type: "pkcs8",
          format: "pem",
        }) as string;
      } else if (keyType === "Ed") {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        handle = `sim:ed:${randomBytes(8).toString("hex")}`;
        publicKeyPem = publicKey.export({
          type: "spki",
          format: "pem",
        }) as string;
        privateKeyPem = privateKey.export({
          type: "pkcs8",
          format: "pem",
        }) as string;
      } else if (keyType === "RSA") {
        const { privateKey, publicKey } = generateKeyPairSync("rsa", {
          modulusLength: rsaBits,
          publicExponent: 65537,
        });
        handle = `sim:rsa:${randomBytes(8).toString("hex")}`;
        publicKeyPem = publicKey.export({
          type: "spki",
          format: "pem",
        }) as string;
        privateKeyPem = privateKey.export({
          type: "pkcs8",
          format: "pem",
        }) as string;
      } else {
        throw new Error(`Unsupported key type: ${keyType}`);
      }
    }

    // Build entry without undefined optional properties (exactOptionalPropertyTypes)
    const entry: AsymmetricKeyEntry = {
      kind: "asymmetric",
      keyLabel,
      handle,
      privateKeyPem,
      publicKeyPem,
      keyType,
      createdAt,
    };
    if (keyType !== "RSA") {
      entry.namedCurve = namedCurve as HsmNamedCurve;
    }
    if (keyType === "RSA") {
      entry.rsaBits = rsaBits;
    }
    this.keyStore.set(keyLabel, entry);

    this.audit.record("generateKeyPair", keyLabel, "success", keyType);

    // Build result without undefined optional properties (exactOptionalPropertyTypes)
    const result: HsmKeyPair = {
      keyLabel,
      keyType,
      publicKeyPem,
      privateKeyHandle: `hsm:${this.slotId}:${keyLabel}:${handle}`,
      createdAt,
    };
    if (keyType !== "RSA") {
      result.namedCurve = namedCurve as HsmNamedCurve;
    }
    if (keyType === "RSA") {
      result.rsaBits = rsaBits;
    }
    return result;
  }

  /**
   * Sign data asynchronously.
   * Supports ECDSA-SHA256, ECDSA-SHA384, Ed25519, RSA-PSS-SHA256, RSA-PKCS1-SHA256.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   */
  async signAsync(
    keyLabel: string,
    data: string,
    algorithm?: HsmSignatureAlgorithm,
  ): Promise<HsmSignatureResult> {
    const entry = this.requireAsymmetric(keyLabel);
    const timestamp = new Date().toISOString();

    // Determine algorithm based on key type if not specified
    const signAlgorithm: SigningAlgorithm =
      algorithm ?? this.getDefaultAlgorithm(entry.keyType);

    let signature: string;

    if (this.crypto) {
      // Use hardware HSM
      const sigBuffer = await this.crypto.sign(
        entry.handle,
        signAlgorithm,
        Buffer.from(data),
      );
      signature = sigBuffer.toString("hex");
    } else {
      // Fall back to simulator
      signature = this.signSync(entry, data, signAlgorithm);
    }

    const hsmAttestation = sha256hex(
      `${this.slotId}:${keyLabel}:${timestamp}:${signature}`,
    );

    this.audit.record("sign", keyLabel, "success", signAlgorithm);

    return {
      keyLabel,
      algorithm: signAlgorithm,
      signature,
      publicKeyPem: entry.publicKeyPem,
      timestamp,
      hsmAttestation,
    };
  }

  /**
   * Verify signature asynchronously.
   * Uses HsmCryptoPort if available, otherwise falls back to simulator.
   */
  async verifyAsync(
    keyLabel: string,
    data: string,
    signature: string,
    algorithm?: HsmSignatureAlgorithm,
  ): Promise<boolean> {
    const entry = this.requireAsymmetric(keyLabel);

    const verifyAlgorithm: SigningAlgorithm =
      algorithm ?? this.getDefaultAlgorithm(entry.keyType);

    let valid: boolean;

    if (this.crypto) {
      // Use hardware HSM
      valid = await this.crypto.verify(
        entry.handle,
        verifyAlgorithm,
        Buffer.from(data),
        Buffer.from(signature, "hex"),
      );
    } else {
      // Fall back to simulator
      valid = this.verifySync(entry, data, signature, verifyAlgorithm);
    }

    this.audit.record(
      "verify",
      keyLabel,
      "success",
      valid ? "valid" : "invalid",
    );
    return valid;
  }

  /**
   * Export public key asynchronously.
   */
  async exportPublicKeyAsync(keyLabel: string): Promise<string> {
    const entry = this.requireAsymmetric(keyLabel);

    if (this.crypto) {
      // For PKCS#11, we might need to fetch from HSM
      const pem = await this.crypto.exportPublicKey(entry.handle);
      this.audit.record("exportPublicKey", keyLabel, "success");
      return pem;
    }

    this.audit.record("exportPublicKey", keyLabel, "success");
    return entry.publicKeyPem;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private requireAsymmetric(keyLabel: string): AsymmetricKeyEntry {
    const entry = this.keyStore.get(keyLabel);
    if (!entry) {
      this.audit.record("keyLookup", keyLabel, "failed", "key not found");
      throw new Error(`HSM key not found: ${keyLabel}`);
    }
    if (entry.kind !== "asymmetric") {
      this.audit.record("keyLookup", keyLabel, "failed", "unexpected key type");
      throw new Error(`HSM key '${keyLabel}' is not an asymmetric key`);
    }
    return entry;
  }

  private getDefaultAlgorithm(keyType: HsmKeyType): SigningAlgorithm {
    switch (keyType) {
      case "EC":
        return "ecdsa-sha256";
      case "Ed":
        return "ed25519";
      case "RSA":
        return "rsa-pss-sha256";
      default:
        return "ecdsa-sha256";
    }
  }

  private signSync(
    entry: AsymmetricKeyEntry,
    data: string,
    algorithm: SigningAlgorithm,
  ): string {
    const privateKey = createPrivateKey(entry.privateKeyPem);

    switch (algorithm) {
      case "ecdsa-sha256": {
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer.sign(privateKey).toString("hex");
      }
      case "ecdsa-sha384": {
        const signer = createSign("SHA384");
        signer.update(data);
        signer.end();
        return signer.sign(privateKey).toString("hex");
      }
      case "ed25519": {
        // Ed25519 uses crypto.sign() directly, not createSign()
        const signature = sign(null, Buffer.from(data), privateKey);
        return signature.toString("hex");
      }
      case "rsa-pss-sha256": {
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer
          .sign({ key: privateKey, padding: 6, saltLength: 32 })
          .toString("hex");
      }
      case "rsa-pkcs1-sha256": {
        const signer = createSign("SHA256");
        signer.update(data);
        signer.end();
        return signer.sign({ key: privateKey, padding: 1 }).toString("hex");
      }
      default:
        throw new Error(`Unsupported signing algorithm: ${algorithm}`);
    }
  }

  private verifySync(
    entry: AsymmetricKeyEntry,
    data: string,
    signature: string,
    algorithm: SigningAlgorithm,
  ): boolean {
    const publicKey = createPublicKey(entry.publicKeyPem);
    const sigBuffer = Buffer.from(signature, "hex");

    switch (algorithm) {
      case "ecdsa-sha256": {
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, sigBuffer);
      }
      case "ecdsa-sha384": {
        const verifier = createVerify("SHA384");
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, sigBuffer);
      }
      case "ed25519": {
        // Ed25519 uses crypto.verify() directly, not createVerify()
        return verify(null, Buffer.from(data), publicKey, sigBuffer);
      }
      case "rsa-pss-sha256": {
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify(
          { key: publicKey, padding: 6, saltLength: 32 },
          sigBuffer,
        );
      }
      case "rsa-pkcs1-sha256": {
        const verifier = createVerify("SHA256");
        verifier.update(data);
        verifier.end();
        return verifier.verify({ key: publicKey, padding: 1 }, sigBuffer);
      }
      default:
        throw new Error(`Unsupported verification algorithm: ${algorithm}`);
    }
  }
}
