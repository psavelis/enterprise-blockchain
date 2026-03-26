import {
  createSign,
  createVerify,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

import { sha256hex } from "../../../shared/src/crypto";
import type {
  AsymmetricKeyEntry,
  HsmKeyPair,
  HsmSignatureResult,
} from "../domain/entities";
import type { AuditLog, KeyStore } from "../domain/ports";

/**
 * EC P-256 asymmetric operations — signing, verification, key export.
 *
 * Mirrors a PKCS#11 CKM_ECDSA / CKM_EC_KEY_PAIR_GEN subset.
 * Ref: PKCS#11 v3.1, §2.3.6 — https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html
 */
export class AsymmetricKeyService {
  constructor(
    private readonly keyStore: KeyStore,
    private readonly audit: AuditLog,
    private readonly slotId: string,
  ) {}

  generateKeyPair(keyLabel: string): HsmKeyPair {
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

    this.audit.record("generateKeyPair", keyLabel, "success");

    return {
      keyLabel,
      keyType: "EC",
      namedCurve: "P-256",
      publicKeyPem: pemExport(publicKey),
      privateKeyHandle: handle,
      createdAt,
    };
  }

  sign(keyLabel: string, data: string): HsmSignatureResult {
    const entry = this.requireAsymmetric(keyLabel);
    const timestamp = new Date().toISOString();

    const signer = createSign("SHA256");
    signer.update(data);
    signer.end();
    const signature = signer.sign(entry.privateKey).toString("hex");

    const hsmAttestation = sha256hex(
      `${this.slotId}:${keyLabel}:${timestamp}:${signature}`,
    );

    this.audit.record("sign", keyLabel, "success");

    return {
      keyLabel,
      algorithm: "ecdsa-sha256",
      signature,
      publicKeyPem: pemExport(entry.publicKey),
      timestamp,
      hsmAttestation,
    };
  }

  verify(keyLabel: string, data: string, signature: string): boolean {
    const entry = this.requireAsymmetric(keyLabel);

    const verifier = createVerify("SHA256");
    verifier.update(data);
    verifier.end();
    const valid = verifier.verify(
      entry.publicKey,
      Buffer.from(signature, "hex"),
    );

    this.audit.record(
      "verify",
      keyLabel,
      "success",
      valid ? "valid" : "invalid",
    );
    return valid;
  }

  exportPublicKey(keyLabel: string): string {
    const entry = this.requireAsymmetric(keyLabel);
    this.audit.record("exportPublicKey", keyLabel, "success");
    return pemExport(entry.publicKey);
  }

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
}

function pemExport(key: KeyObject): string {
  const pem = key.export({ type: "spki", format: "pem" });
  if (typeof pem !== "string") {
    throw new Error("HSM: unexpected binary output from PEM export");
  }
  return pem;
}
