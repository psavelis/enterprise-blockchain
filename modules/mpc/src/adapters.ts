/**
 * MPC Module Infrastructure Adapters
 *
 * These adapters implement the ports defined in ports.ts using Node.js crypto.
 * They live in the infrastructure layer and are injected into domain services.
 *
 * @see modules/mpc/src/ports.ts
 */

import {
  randomBytes as nodeRandomBytes,
  randomInt as nodeRandomInt,
} from "node:crypto";
import type { RandomnessProvider, CommitmentProvider } from "./ports";
import { commitShare, sha256hex, timingSafeCompare } from "./crypto";

/**
 * Node.js crypto implementation of RandomnessProvider.
 *
 * Uses Node.js crypto module for cryptographically secure randomness.
 * This is the default adapter for production use.
 */
export class NodeRandomnessProvider implements RandomnessProvider {
  randomBytes(length: number): Buffer {
    return nodeRandomBytes(length);
  }

  randomInt(min: number, max: number): number {
    return nodeRandomInt(min, max);
  }
}

/**
 * Node.js crypto implementation of CommitmentProvider.
 *
 * Uses SHA-256 for commitments and timing-safe comparison.
 */
export class NodeCommitmentProvider implements CommitmentProvider {
  commitShare(
    partyId: string,
    shareIndex: number,
    value: number | bigint,
    nonce: string,
  ): string {
    return commitShare(partyId, shareIndex, value, nonce);
  }

  sha256hex(data: string): string {
    return sha256hex(data);
  }

  timingSafeCompare(a: string, b: string): boolean {
    return timingSafeCompare(a, b);
  }
}

/**
 * Default instances for convenience.
 * Domain code should prefer dependency injection over these singletons.
 */
export const defaultRandomnessProvider = new NodeRandomnessProvider();
export const defaultCommitmentProvider = new NodeCommitmentProvider();
