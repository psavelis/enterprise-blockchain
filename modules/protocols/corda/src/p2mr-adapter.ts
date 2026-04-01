/**
 * Corda P2MR Protocol Adapter (Mock)
 *
 * Placeholder implementation of P2MR for R3 Corda.
 * Returns mock data for testing and development purposes.
 *
 * Real implementation would use Corda RPC client to interact
 * with a P2MR CorDapp.
 *
 * @see skills/p2mr-quantum-safe.md
 */

import type {
  IP2MRProtocolAdapter,
  P2MRProtocolConfig,
  P2MRCreateResult,
  P2MRSpendResult,
  P2MROutputStatus,
} from "../../src/p2mr-port";
import type { SpendProof } from "../../../p2mr/src/types";
import { MerkleTree } from "../../../p2mr/src/merkle-tree";

/**
 * Mock Corda P2MR adapter for testing and development.
 *
 * NOTE: This is a placeholder. Real implementation would use:
 * - Corda RPC client for flow invocation
 * - P2MR CorDapp with P2MROutput state and spending flows
 * - Corda notary for double-spend prevention
 */
export class CordaP2MRAdapter implements IP2MRProtocolAdapter {
  readonly protocol = "corda" as const;
  readonly config: P2MRProtocolConfig;

  // In-memory store for mock implementation
  readonly #outputs = new Map<
    string,
    {
      merkleRoot: string;
      value: bigint;
      createdAt: number;
      spent: boolean;
      metadataHash?: string;
    }
  >();

  #txCounter = 0;

  constructor(config: P2MRProtocolConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // IP2MRCreatePort
  // ---------------------------------------------------------------------------

  createOutput(
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult> {
    // Corda uses linear IDs for state tracking
    const outputId = `corda-linear-${Date.now()}-${++this.#txCounter}`;
    const txRef = `corda-tx-${this.#txCounter}`;

    const outputData: {
      merkleRoot: string;
      value: bigint;
      createdAt: number;
      spent: boolean;
      metadataHash?: string;
    } = {
      merkleRoot,
      value,
      createdAt: Date.now(),
      spent: false,
    };
    if (metadataHash !== undefined) {
      outputData.metadataHash = metadataHash;
    }
    this.#outputs.set(outputId, outputData);

    return Promise.resolve({
      outputId,
      txRef,
      blockHeight: this.#txCounter, // Corda doesn't have blocks, using tx sequence
      metadata: {
        notary: "O=Notary,L=London,C=GB",
        cordaFlowClass: "P2MRCreateFlow",
        mock: true,
      },
    });
  }

  createOutputWithId(
    outputId: string,
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult> {
    if (this.#outputs.has(outputId)) {
      return Promise.reject(new Error(`Output ${outputId} already exists`));
    }

    const txRef = `corda-tx-${++this.#txCounter}`;

    const outputData: {
      merkleRoot: string;
      value: bigint;
      createdAt: number;
      spent: boolean;
      metadataHash?: string;
    } = {
      merkleRoot,
      value,
      createdAt: Date.now(),
      spent: false,
    };
    if (metadataHash !== undefined) {
      outputData.metadataHash = metadataHash;
    }
    this.#outputs.set(outputId, outputData);

    return Promise.resolve({
      outputId,
      txRef,
      blockHeight: this.#txCounter,
      metadata: {
        notary: "O=Notary,L=London,C=GB",
        cordaFlowClass: "P2MRCreateFlow",
        mock: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // IP2MRSpendPort
  // ---------------------------------------------------------------------------

  spend(proof: SpendProof, recipient: string): Promise<P2MRSpendResult> {
    const output = this.#outputs.get(proof.outputId);

    if (!output) {
      return Promise.reject(
        new Error(`Output ${proof.outputId} does not exist`),
      );
    }

    if (output.spent) {
      return Promise.reject(
        new Error(`Output ${proof.outputId} already spent (notary rejected)`),
      );
    }

    // Verify Merkle proof
    const proofValid = MerkleTree.verify(
      proof.revealedLeaf,
      proof.merkleProof,
      output.merkleRoot,
    );

    if (!proofValid) {
      return Promise.reject(new Error("Invalid Merkle proof"));
    }

    // Mark as spent (notarized)
    output.spent = true;
    const txRef = `corda-tx-${++this.#txCounter}`;

    return Promise.resolve({
      outputId: proof.outputId,
      txRef,
      blockHeight: this.#txCounter,
      recipient,
      value: output.value,
    });
  }

  // ---------------------------------------------------------------------------
  // IP2MRQueryPort
  // ---------------------------------------------------------------------------

  getOutputStatus(outputId: string): Promise<P2MROutputStatus> {
    const output = this.#outputs.get(outputId);

    if (!output) {
      return Promise.resolve({
        exists: false,
        unspent: false,
      });
    }

    const p2mrOutput: P2MROutputStatus["output"] = {
      outputId,
      merkleRoot: output.merkleRoot,
      value: output.value,
      createdAt: output.createdAt,
    };
    if (output.metadataHash !== undefined) {
      p2mrOutput.metadataHash = output.metadataHash;
    }

    return Promise.resolve({
      exists: true,
      unspent: !output.spent,
      output: p2mrOutput,
    });
  }

  verifyMerkleProof(
    leafHash: string,
    merkleRoot: string,
    proof: Array<{ hash: string; position: "left" | "right" }>,
  ): Promise<boolean> {
    return Promise.resolve(MerkleTree.verifyHash(leafHash, proof, merkleRoot));
  }
}
