/**
 * Dilithium (ML-DSA-65) Signing Adapter
 *
 * Wraps the existing MPC module's ML-DSA-65 implementation.
 * Provides post-quantum signatures for transaction authentication.
 *
 * @see modules/mpc/src/dsa.ts for underlying implementation
 * @see domain/ports.ts for DilithiumSigningPort interface
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import { createHash } from "node:crypto";

import { MlDsaSigner } from "../../../../mpc/src/dsa";
import type {
  DilithiumSigningPort,
  TransactionSigningPort,
} from "../../domain/ports";
import type { TransactionPayload } from "../../domain/entities";

/**
 * Adapter for ML-DSA-65 signing operations.
 *
 * Uses the existing MlDsaSigner from the MPC module.
 */
export class DilithiumSigningAdapter implements DilithiumSigningPort {
  private readonly signer: MlDsaSigner;
  private readonly params = "ml-dsa-65" as const;

  constructor() {
    this.signer = new MlDsaSigner();
  }

  generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const keypair = this.signer.generateKeyPair(this.params);
    return {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    };
  }

  sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    const result = this.signer.sign(message, secretKey, this.params);
    return result.signature;
  }

  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean {
    return this.signer.verify(message, signature, publicKey, this.params);
  }

  hashPublicKey(publicKey: Uint8Array): string {
    return createHash("sha256").update(publicKey).digest("hex");
  }
}

/**
 * Transaction signing adapter that combines payload serialization with ML-DSA-65 signing.
 */
export class TransactionSigningAdapter implements TransactionSigningPort {
  constructor(private readonly dilithium: DilithiumSigningPort) {}

  signPayload(payload: TransactionPayload, secretKey: Uint8Array): Uint8Array {
    const serialized = this.serializePayload(payload);
    return this.dilithium.sign(serialized, secretKey);
  }

  verifyPayload(
    payload: TransactionPayload,
    signature: Uint8Array,
    publicKey: Uint8Array,
  ): boolean {
    const serialized = this.serializePayload(payload);
    return this.dilithium.verify(serialized, signature, publicKey);
  }

  serializePayload(payload: TransactionPayload): Uint8Array {
    // Canonical JSON serialization (sorted keys, no whitespace)
    const canonical = JSON.stringify(payload, Object.keys(payload).sort());
    return new TextEncoder().encode(canonical);
  }
}

/**
 * Mock Dilithium adapter for testing without crypto overhead.
 */
export class MockDilithiumAdapter implements DilithiumSigningPort {
  private keyPairCounter = 0;

  generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const id = this.keyPairCounter++;
    const publicKey = new Uint8Array(32);
    const secretKey = new Uint8Array(32);

    // Fill with deterministic pattern
    for (let i = 0; i < 32; i++) {
      publicKey[i] = (id + i) & 0xff;
      secretKey[i] = (id + i + 128) & 0xff;
    }

    return { publicKey, secretKey };
  }

  sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
    // Mock signature: hash of message + secretKey
    const hash = createHash("sha256");
    hash.update(message);
    hash.update(secretKey);
    return new Uint8Array(hash.digest());
  }

  verify(
    _message: Uint8Array,
    signature: Uint8Array,
    _publicKey: Uint8Array,
  ): boolean {
    // Mock verification: signature must be 32 bytes
    return signature.length === 32;
  }

  hashPublicKey(publicKey: Uint8Array): string {
    return createHash("sha256").update(publicKey).digest("hex");
  }
}

/**
 * Default Dilithium adapter instance.
 */
export const defaultDilithiumAdapter: DilithiumSigningPort =
  new DilithiumSigningAdapter();

/**
 * Create a transaction signing adapter with the default Dilithium adapter.
 */
export function createTransactionSigningAdapter(): TransactionSigningPort {
  return new TransactionSigningAdapter(defaultDilithiumAdapter);
}
