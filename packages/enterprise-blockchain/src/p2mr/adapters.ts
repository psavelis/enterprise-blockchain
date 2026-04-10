/**
 * P2MR Module Infrastructure Adapters
 *
 * These adapters implement the ports defined in ports.ts.
 * They live in the infrastructure layer and are injected into domain services.
 *
 * @see modules/p2mr/src/ports.ts
 */

import { MlDsaSigner } from "../mpc/dsa.js";
import { sha256hex } from "../shared/crypto.js";
import type {
  SignatureVerificationPort,
  HashingPort,
  SignatureAlgorithm,
} from "./ports.js";

/**
 * ML-DSA implementation of SignatureVerificationPort.
 *
 * Uses the MlDsaSigner from the MPC module for post-quantum signature verification.
 */
export class MlDsaSignatureVerifier implements SignatureVerificationPort {
  private readonly signer = new MlDsaSigner();

  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    algorithm: SignatureAlgorithm,
  ): boolean {
    return this.signer.verify(message, signature, publicKey, algorithm);
  }
}

/**
 * SHA-256 implementation of HashingPort.
 */
export class Sha256Hasher implements HashingPort {
  sha256hex(data: string): string {
    return sha256hex(data);
  }
}

/**
 * Default instances for convenience.
 * Domain code should prefer dependency injection over these singletons.
 */
export const defaultSignatureVerifier = new MlDsaSignatureVerifier();
export const defaultHasher = new Sha256Hasher();
