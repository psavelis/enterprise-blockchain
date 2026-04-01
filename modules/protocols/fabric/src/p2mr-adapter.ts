/**
 * Fabric P2MR Protocol Adapter (Mock)
 *
 * Placeholder implementation of P2MR for Hyperledger Fabric.
 * Returns mock data for testing and development purposes.
 *
 * Real implementation would use Fabric Gateway SDK to interact
 * with a P2MR chaincode.
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
 * Mock Fabric P2MR adapter for testing and development.
 *
 * NOTE: This is a placeholder. Real implementation would use:
 * - @hyperledger/fabric-gateway for chaincode interaction
 * - P2MR chaincode deployed to Fabric channel
 * - Fabric private data collections for off-chain tree storage
 */
export class FabricP2MRAdapter implements IP2MRProtocolAdapter {
  readonly protocol = "fabric" as const;
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
  #blockHeight = 0;

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
    const outputId = `fabric-output-${Date.now()}-${++this.#txCounter}`;
    const txRef = `fabric-tx-${this.#txCounter}`;

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

    this.#blockHeight++;

    return Promise.resolve({
      outputId,
      txRef,
      blockHeight: this.#blockHeight,
      metadata: {
        chaincodeName: this.config.chaincodeName ?? "p2mr-chaincode",
        channelName: this.config.channelName ?? "p2mr-channel",
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

    const txRef = `fabric-tx-${++this.#txCounter}`;

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

    this.#blockHeight++;

    return Promise.resolve({
      outputId,
      txRef,
      blockHeight: this.#blockHeight,
      metadata: {
        chaincodeName: this.config.chaincodeName ?? "p2mr-chaincode",
        channelName: this.config.channelName ?? "p2mr-channel",
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
        new Error(`Output ${proof.outputId} already spent`),
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

    // Mark as spent
    output.spent = true;
    const txRef = `fabric-tx-${++this.#txCounter}`;
    this.#blockHeight++;

    return Promise.resolve({
      outputId: proof.outputId,
      txRef,
      blockHeight: this.#blockHeight,
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
    // Use the static verifyHash method
    return Promise.resolve(MerkleTree.verifyHash(leafHash, proof, merkleRoot));
  }
}
