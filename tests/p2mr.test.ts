/**
 * P2MR (Pay-to-Merkle-Root) Module Tests
 *
 * Comprehensive tests for the quantum-safe P2MR pattern:
 * - Merkle tree construction and verification
 * - Script leaf validation and factory functions
 * - P2MR output creation and storage
 * - Spend proof building and validation
 * - Script interpretation with ML-DSA-65
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MerkleTree,
  canonicalJSON,
  hashScriptLeaf,
  createSingleSigLeaf,
  createTimelockLeaf,
  createMultisigLeaf,
  createHsmAttestedLeaf,
  validateScriptLeaf,
  createP2MROutput,
  P2MROutputStore,
  buildSpendProof,
  verifySpendProofStructure,
  interpretScript,
  hashPublicKey,
} from "../modules/p2mr/src/index";
import type { ScriptLeaf } from "../modules/p2mr/src/types";
import { MlDsaSigner } from "../modules/mpc/src/dsa";

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

const VALID_HASH = "a".repeat(64); // 32-byte hex hash
const VALID_HASH_2 = "b".repeat(64);
const VALID_HASH_3 = "c".repeat(64);

function createTestLeaf(
  type: ScriptLeaf["type"] = "ml-dsa-65-sig",
): ScriptLeaf {
  return {
    type,
    publicKeyHashes: [VALID_HASH],
  };
}

// ---------------------------------------------------------------------------
// canonicalJSON Tests
// ---------------------------------------------------------------------------

describe("canonicalJSON", () => {
  it("produces deterministic output regardless of key order", () => {
    const obj1 = { b: 2, a: 1, c: 3 };
    const obj2 = { a: 1, c: 3, b: 2 };
    assert.equal(canonicalJSON(obj1), canonicalJSON(obj2));
  });

  it("handles nested objects with sorted keys", () => {
    const obj = { z: { b: 2, a: 1 }, y: [3, 2, 1] };
    const expected = '{"y":[3,2,1],"z":{"a":1,"b":2}}';
    assert.equal(canonicalJSON(obj), expected);
  });

  it("handles null and undefined values", () => {
    assert.equal(canonicalJSON(null), "null");
    // JSON.stringify(undefined) returns undefined (not the string "undefined")
    assert.equal(canonicalJSON(undefined), undefined);
    // Object with undefined value should skip that key
    const obj = { a: 1, b: undefined };
    assert.equal(canonicalJSON(obj), '{"a":1}');
  });

  it("handles arrays correctly", () => {
    assert.equal(canonicalJSON([1, 2, 3]), "[1,2,3]");
    assert.equal(canonicalJSON([{ b: 2, a: 1 }]), '[{"a":1,"b":2}]');
  });

  it("handles primitive types", () => {
    assert.equal(canonicalJSON("hello"), '"hello"');
    assert.equal(canonicalJSON(42), "42");
    assert.equal(canonicalJSON(true), "true");
    assert.equal(canonicalJSON(false), "false");
  });
});

// ---------------------------------------------------------------------------
// MerkleTree Tests
// ---------------------------------------------------------------------------

describe("MerkleTree", () => {
  it("throws error for empty leaves array", () => {
    assert.throws(() => new MerkleTree([]), /at least one leaf/);
  });

  it("computes correct root for single leaf", () => {
    const leaf = createTestLeaf();
    const tree = new MerkleTree([leaf]);
    assert.equal(tree.leafCount, 1);
    // Root should be the hash of the single leaf
    assert.equal(tree.root, hashScriptLeaf(leaf));
  });

  it("computes balanced tree for two leaves", () => {
    const leaf1 = createTestLeaf();
    const leaf2 = { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_2] };
    const tree = new MerkleTree([leaf1, leaf2]);

    assert.equal(tree.leafCount, 2);
    assert.equal(tree.root.length, 64); // 32-byte hex
    // Root should be hash of (hash(leaf1) + hash(leaf2))
    assert.notEqual(tree.root, hashScriptLeaf(leaf1));
    assert.notEqual(tree.root, hashScriptLeaf(leaf2));
  });

  it("handles odd number of leaves by duplicating last", () => {
    const leaves = [
      createTestLeaf(),
      { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_2] },
      { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_3] },
    ];
    const tree = new MerkleTree(leaves);
    assert.equal(tree.leafCount, 3);
    assert.equal(tree.root.length, 64);
  });

  it("generates valid proof for each leaf", () => {
    const leaves = [
      createTestLeaf(),
      { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_2] },
      { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_3] },
    ];
    const tree = new MerkleTree(leaves);

    for (let i = 0; i < leaves.length; i++) {
      const proof = tree.getProof(i);
      const valid = MerkleTree.verify(leaves[i]!, proof, tree.root);
      assert.equal(valid, true, `Proof for leaf ${i} should be valid`);
    }
  });

  it("throws error for out of bounds leaf index", () => {
    const tree = new MerkleTree([createTestLeaf()]);
    assert.throws(() => tree.getProof(-1), /out of bounds/);
    assert.throws(() => tree.getProof(1), /out of bounds/);
  });

  it("verifyHash works with pre-computed hash", () => {
    const leaf = createTestLeaf();
    const tree = new MerkleTree([
      leaf,
      { ...createTestLeaf(), publicKeyHashes: [VALID_HASH_2] },
    ]);
    const proof = tree.getProof(0);
    const leafHash = hashScriptLeaf(leaf);
    const valid = MerkleTree.verifyHash(leafHash, proof, tree.root);
    assert.equal(valid, true);
  });

  it("rejects proof with wrong root", () => {
    const tree = new MerkleTree([createTestLeaf()]);
    const proof = tree.getProof(0);
    const wrongRoot = "f".repeat(64);
    const valid = MerkleTree.verify(createTestLeaf(), proof, wrongRoot);
    assert.equal(valid, false);
  });
});

// ---------------------------------------------------------------------------
// Script Leaf Validation Tests
// ---------------------------------------------------------------------------

describe("validateScriptLeaf", () => {
  it("validates ml-dsa-65-sig with single hash", () => {
    const result = validateScriptLeaf(createSingleSigLeaf(VALID_HASH));
    assert.equal(result.valid, true);
  });

  it("rejects ml-dsa-65-sig with multiple hashes", () => {
    const result = validateScriptLeaf({
      type: "ml-dsa-65-sig",
      publicKeyHashes: [VALID_HASH, VALID_HASH_2],
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("exactly one"));
  });

  it("validates timelock with locktime", () => {
    const result = validateScriptLeaf(
      createTimelockLeaf(VALID_HASH, Date.now() + 1000),
    );
    assert.equal(result.valid, true);
  });

  it("rejects timelock with negative locktime", () => {
    const result = validateScriptLeaf({
      type: "timelock",
      publicKeyHashes: [VALID_HASH],
      locktime: -1,
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("non-negative"));
  });

  it("validates multisig with threshold", () => {
    const result = validateScriptLeaf(
      createMultisigLeaf([VALID_HASH, VALID_HASH_2, VALID_HASH_3], 2),
    );
    assert.equal(result.valid, true);
  });

  it("rejects multisig with threshold > n", () => {
    const result = validateScriptLeaf({
      type: "multisig-ml-dsa",
      publicKeyHashes: [VALID_HASH, VALID_HASH_2],
      threshold: 5,
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("threshold"));
  });

  it("rejects multisig with < 2 keys", () => {
    const result = validateScriptLeaf({
      type: "multisig-ml-dsa",
      publicKeyHashes: [VALID_HASH],
      threshold: 1,
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("at least 2"));
  });

  it("validates hsm-attested-sig with slot ID", () => {
    const result = validateScriptLeaf(
      createHsmAttestedLeaf(VALID_HASH, "slot-123"),
    );
    assert.equal(result.valid, true);
  });

  it("rejects hsm-attested-sig without slot ID", () => {
    const result = validateScriptLeaf({
      type: "hsm-attested-sig",
      publicKeyHashes: [VALID_HASH],
      hsmSlotId: "",
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("hsmSlotId"));
  });

  it("rejects invalid public key hash format", () => {
    const result = validateScriptLeaf({
      type: "ml-dsa-65-sig",
      publicKeyHashes: ["invalid"],
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("64 hex"));
  });

  it("rejects empty publicKeyHashes array", () => {
    const result = validateScriptLeaf({
      type: "ml-dsa-65-sig",
      publicKeyHashes: [],
    });
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("non-empty"));
  });
});

// ---------------------------------------------------------------------------
// P2MR Output Tests
// ---------------------------------------------------------------------------

describe("createP2MROutput", () => {
  it("creates output with correct Merkle root", () => {
    const leaves = [createSingleSigLeaf(VALID_HASH)];
    const { output, tree } = createP2MROutput({
      leaves,
      value: BigInt(1000),
    });

    assert.equal(output.merkleRoot, tree.root);
    assert.equal(output.value, BigInt(1000));
    assert.ok(output.outputId.length > 0);
    assert.ok(output.createdAt > 0);
  });

  it("throws for empty leaves", () => {
    assert.throws(
      () => createP2MROutput({ leaves: [], value: BigInt(1000) }),
      /at least one spending condition/,
    );
  });

  it("throws for negative value", () => {
    assert.throws(
      () =>
        createP2MROutput({
          leaves: [createSingleSigLeaf(VALID_HASH)],
          value: BigInt(-1),
        }),
      /non-negative/,
    );
  });

  it("includes metadata hash when provided", () => {
    const { output } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
      metadataHash: "d".repeat(64),
    });
    assert.equal(output.metadataHash, "d".repeat(64));
  });
});

// ---------------------------------------------------------------------------
// P2MROutputStore Tests
// ---------------------------------------------------------------------------

describe("P2MROutputStore", () => {
  it("adds and retrieves outputs", () => {
    const store = new P2MROutputStore();
    const { output } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });

    store.add(output);
    const retrieved = store.get(output.outputId);
    assert.deepEqual(retrieved, output);
  });

  it("throws when adding duplicate output", () => {
    const store = new P2MROutputStore();
    const { output } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });

    store.add(output);
    assert.throws(() => store.add(output), /already exists/);
  });

  it("tracks spent/unspent status", () => {
    const store = new P2MROutputStore();
    const { output } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });

    store.add(output);
    assert.equal(store.isUnspent(output.outputId), true);

    store.markSpent(output.outputId);
    assert.equal(store.isUnspent(output.outputId), false);
  });

  it("throws when double-spending", () => {
    const store = new P2MROutputStore();
    const { output } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });

    store.add(output);
    store.markSpent(output.outputId);
    assert.throws(() => store.markSpent(output.outputId), /already spent/);
  });

  it("computes unspent balance correctly", () => {
    const store = new P2MROutputStore();

    const { output: o1 } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });
    const { output: o2 } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH_2)],
      value: BigInt(2000),
    });

    store.add(o1);
    store.add(o2);

    assert.equal(store.getUnspentBalance(), BigInt(3000));

    store.markSpent(o1.outputId);
    assert.equal(store.getUnspentBalance(), BigInt(2000));
  });
});

// ---------------------------------------------------------------------------
// Spend Proof Tests
// ---------------------------------------------------------------------------

describe("buildSpendProof", () => {
  it("builds valid proof for single-sig leaf", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const { output, tree } = createP2MROutput({
      leaves: [createSingleSigLeaf(keyHash)],
      value: BigInt(1000),
    });

    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const proof = buildSpendProof({
      outputId: output.outputId,
      tree,
      leafIndex: 0,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [sigResult.signature],
      },
    });

    assert.equal(proof.outputId, output.outputId);
    assert.equal(proof.revealedLeaf.type, "ml-dsa-65-sig");
    assert.ok(proof.merkleProof.length >= 0);
  });

  it("throws for out of bounds leaf index", () => {
    const { tree } = createP2MROutput({
      leaves: [createSingleSigLeaf(VALID_HASH)],
      value: BigInt(1000),
    });

    assert.throws(
      () =>
        buildSpendProof({
          outputId: "test",
          tree,
          leafIndex: 5,
          witness: {
            publicKeys: [new Uint8Array(1952)],
            signatures: [new Uint8Array(3309)],
          },
        }),
      /out of bounds/,
    );
  });
});

describe("verifySpendProofStructure", () => {
  it("verifies valid proof structure", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const { output, tree } = createP2MROutput({
      leaves: [createSingleSigLeaf(keyHash)],
      value: BigInt(1000),
    });

    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const proof = buildSpendProof({
      outputId: output.outputId,
      tree,
      leafIndex: 0,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [sigResult.signature],
      },
    });

    const result = verifySpendProofStructure(proof, output);
    assert.equal(result.valid, true);
  });

  it("rejects proof with wrong output ID", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const { output, tree } = createP2MROutput({
      leaves: [createSingleSigLeaf(keyHash)],
      value: BigInt(1000),
    });

    const proof = buildSpendProof({
      outputId: "wrong-id",
      tree,
      leafIndex: 0,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [new Uint8Array(3309)],
      },
    });

    const result = verifySpendProofStructure(proof, output);
    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("does not match"));
  });
});

// ---------------------------------------------------------------------------
// Script Interpreter Tests
// ---------------------------------------------------------------------------

describe("interpretScript", () => {
  it("verifies valid ML-DSA-65 signature", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const leaf = createSingleSigLeaf(keyHash);
    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [sigResult.signature],
      },
      message,
    });

    assert.equal(result.valid, true);
    assert.ok(result.auditTrail.length > 0);
  });

  it("rejects wrong public key", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const wrongKeys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const leaf = createSingleSigLeaf(keyHash);
    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [wrongKeys.publicKey], // Wrong key
        signatures: [sigResult.signature],
      },
      message,
    });

    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("hash does not match"));
  });

  it("rejects invalid signature", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const leaf = createSingleSigLeaf(keyHash);
    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    // Tamper with signature
    const tamperedSig = new Uint8Array(sigResult.signature);
    if (tamperedSig[42] !== undefined) {
      tamperedSig[42] ^= 0xff;
    }

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [tamperedSig],
      },
      message,
    });

    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("signature verification failed"));
  });

  it("verifies timelock when time has passed", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const locktime = Date.now() - 1000; // In the past
    const leaf = createTimelockLeaf(keyHash, locktime);
    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [sigResult.signature],
        timestamp: Date.now(),
      },
      message,
      currentTime: Date.now(),
    });

    assert.equal(result.valid, true);
  });

  it("rejects timelock when time has not passed", () => {
    const signer = new MlDsaSigner();
    const keys = signer.generateKeyPair("ml-dsa-65");
    const keyHash = hashPublicKey(keys.publicKey);

    const locktime = Date.now() + 1000000; // In the future
    const leaf = createTimelockLeaf(keyHash, locktime);
    const message = new TextEncoder().encode("test message");
    const sigResult = signer.sign(message, keys.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys.publicKey],
        signatures: [sigResult.signature],
        timestamp: Date.now(),
      },
      message,
      currentTime: Date.now(),
    });

    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("not reached"));
  });

  it("verifies 2-of-3 multisig", () => {
    const signer = new MlDsaSigner();
    const keys = [
      signer.generateKeyPair("ml-dsa-65"),
      signer.generateKeyPair("ml-dsa-65"),
      signer.generateKeyPair("ml-dsa-65"),
    ];
    const keyHashes = keys.map((k) => hashPublicKey(k.publicKey));

    const leaf = createMultisigLeaf(keyHashes, 2);
    const message = new TextEncoder().encode("test message");

    // Sign with only 2 keys
    const sig1 = signer.sign(message, keys[0]!.secretKey, "ml-dsa-65");
    const sig2 = signer.sign(message, keys[1]!.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys[0]!.publicKey, keys[1]!.publicKey],
        signatures: [sig1.signature, sig2.signature],
      },
      message,
    });

    assert.equal(result.valid, true);
  });

  it("rejects multisig below threshold", () => {
    const signer = new MlDsaSigner();
    const keys = [
      signer.generateKeyPair("ml-dsa-65"),
      signer.generateKeyPair("ml-dsa-65"),
      signer.generateKeyPair("ml-dsa-65"),
    ];
    const keyHashes = keys.map((k) => hashPublicKey(k.publicKey));

    const leaf = createMultisigLeaf(keyHashes, 2);
    const message = new TextEncoder().encode("test message");

    // Sign with only 1 key (below threshold)
    const sig1 = signer.sign(message, keys[0]!.secretKey, "ml-dsa-65");

    const result = interpretScript({
      leaf,
      witness: {
        publicKeys: [keys[0]!.publicKey],
        signatures: [sig1.signature],
      },
      message,
    });

    assert.equal(result.valid, false);
    assert.ok(result.reason.includes("signatures"));
  });
});
