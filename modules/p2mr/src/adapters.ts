/**
 * P2MR Module Infrastructure Adapters
 *
 * These adapters implement the ports defined in ports.ts.
 * They live in the infrastructure layer and are injected into domain services.
 *
 * HEXAGONAL ARCHITECTURE: Adapters depend on ports, not concrete implementations.
 * The MlDsaSigner is injected via constructor or factory, not imported directly.
 *
 * @see modules/p2mr/src/ports.ts
 */

import { sha256hex } from "../../shared/src/crypto";
import type {
  SignatureVerificationPort,
  HashingPort,
  SignatureAlgorithm,
} from "./ports";

/**
 * Interface for ML-DSA signature operations.
 * Matches the MlDsaSigner API without creating a direct dependency.
 */
export interface MlDsaSignerPort {
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    params: SignatureAlgorithm,
  ): boolean;
}

/**
 * ML-DSA implementation of SignatureVerificationPort.
 *
 * HEXAGONAL ARCHITECTURE: Accepts signer via constructor injection.
 * This allows testing with mock implementations and avoids direct
 * cross-module dependencies on concrete classes.
 */
export class MlDsaSignatureVerifier implements SignatureVerificationPort {
  constructor(private readonly signer: MlDsaSignerPort) {}

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
 * Factory function to create MlDsaSignatureVerifier with default signer.
 * Import this at application composition root to wire up dependencies.
 *
 * Usage:
 * ```typescript
 * import { MlDsaSigner } from "../../mpc/src/dsa";
 * const verifier = createMlDsaSignatureVerifier(new MlDsaSigner());
 * ```
 */
export function createMlDsaSignatureVerifier(
  signer: MlDsaSignerPort,
): MlDsaSignatureVerifier {
  return new MlDsaSignatureVerifier(signer);
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
 * Default hasher instance for convenience.
 * Domain code should prefer dependency injection over this singleton.
 */
export const defaultHasher = new Sha256Hasher();

// Eagerly-initialized default signature verifier.
// The MPC module is imported at module load time.
// For production use, prefer explicit dependency injection via createMlDsaSignatureVerifier().
import { MlDsaSigner } from "../../mpc/src/dsa.js";

const _defaultSignatureVerifier = new MlDsaSignatureVerifier(new MlDsaSigner());

/**
 * Get the default signature verifier.
 *
 * For production use, prefer explicit dependency injection via createMlDsaSignatureVerifier().
 */
export function getDefaultSignatureVerifier(): SignatureVerificationPort {
  return _defaultSignatureVerifier;
}

/**
 * @deprecated Use getDefaultSignatureVerifier() instead.
 * This getter maintains backward compatibility but prefers lazy initialization.
 */
export const defaultSignatureVerifier: SignatureVerificationPort = {
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    algorithm: SignatureAlgorithm,
  ): boolean {
    return getDefaultSignatureVerifier().verify(
      message,
      signature,
      publicKey,
      algorithm,
    );
  },
};
