# P2MR (Pay-to-Merkle-Root) Architecture

BIP-360-inspired quantum-safe output pattern for enterprise blockchain platforms.

## Overview

P2MR provides quantum-proof transaction outputs by committing only to a Merkle root of spending conditions on-chain. No public keys are exposed until spend time, eliminating the "harvest now, decrypt later" quantum threat.

## The Quantum Threat

Traditional blockchain outputs expose public keys on-chain:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Traditional Output Pattern                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  On-chain storage:                                              │
│  ┌─────────────────────────────────────────────┐                │
│  │ Output: { publicKey: "0x...", value: 100 }  │ ◄─── Exposed!  │
│  └─────────────────────────────────────────────┘                │
│                                                                 │
│  Quantum adversary:                                             │
│  1. Harvest public key from blockchain                          │
│  2. Run Shor's algorithm (future CRQC)                          │
│  3. Derive private key                                          │
│  4. Spend output before legitimate owner                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## P2MR Solution

```
┌─────────────────────────────────────────────────────────────────┐
│                        P2MR Output Pattern                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  On-chain storage:                                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Output: { merkleRoot: "a1b2c3...", value: 100 }           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                    │                                            │
│                    │ No public keys!                            │
│                    │ Only a 32-byte hash                        │
│                    ▼                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Script Tree                            │  │
│  │                                                           │  │
│  │                    [Merkle Root]                          │  │
│  │                    /            \                         │  │
│  │              [H01]              [H23]                      │  │
│  │             /      \           /      \                   │  │
│  │         [L0]      [L1]     [L2]      [L3]                 │  │
│  │                                                           │  │
│  │   L0: Bank B sig        L2: Clearing House + timelock     │  │
│  │   L1: Bank A + CH 2/2   L3: (duplicate for balance)       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Quantum adversary:                                             │
│  ✗ No public key to harvest                                     │
│  ✗ Merkle root reveals nothing about spending conditions        │
│  ✗ Cannot precompute private keys                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Module Architecture

```
modules/p2mr/
├── src/
│   ├── index.ts                    # Public exports
│   │   └── Exports: MerkleTree, P2MROutput, SpendProof, ScriptInterpreter
│   │
│   ├── types.ts                    # Core type definitions
│   │   └── ScriptLeaf, P2MROutput, SpendProof, SpendWitness, MerkleProofNode
│   │
│   ├── merkle-tree.ts              # Merkle tree implementation
│   │   └── MerkleTree class with proof generation/verification
│   │
│   ├── script-leaf.ts              # Script leaf creation and validation
│   │   └── createScriptLeaf(), validateScriptLeaf()
│   │
│   ├── p2mr-output.ts              # P2MR output handling
│   │   └── createP2MROutput(), P2MROutputStore (in-memory)
│   │
│   ├── spend-proof.ts              # Spend proof validation
│   │   └── P2MRSpendVerifier class
│   │
│   └── script-interpreter.ts       # Script execution engine
│       └── P2MRScriptInterpreter class
│
└── package.json
```

## Type Definitions

### Script Leaf

```typescript
type ScriptLeafType =
  | "ml-dsa-65-sig" // Single ML-DSA-65 signature
  | "timelock" // Time-locked ML-DSA-65 signature
  | "multisig-ml-dsa" // k-of-n ML-DSA-65 threshold
  | "hsm-attested-sig"; // HSM-backed ML-DSA-65 signature

interface ScriptLeaf {
  type: ScriptLeafType;
  publicKeyHashes: string[]; // SHA-256 hashes of ML-DSA-65 public keys
  threshold?: number; // For multisig: minimum signatures required
  locktime?: number; // For timelock: Unix timestamp
  hsmSlotId?: string; // For HSM: required slot identifier
}
```

### P2MR Output

```typescript
interface P2MROutput {
  outputId: string; // UUID v4
  merkleRoot: string; // 64 hex chars (SHA-256 of script tree root)
  value: bigint; // Amount in base units
  createdAt: number; // Block timestamp
  metadataHash?: string; // Optional: SHA-256 of off-chain metadata
}
```

### Spend Proof

```typescript
interface SpendProof {
  outputId: string;
  revealedLeaf: ScriptLeaf;
  merkleProof: MerkleProofNode[];
  witness: SpendWitness;
}

interface SpendWitness {
  publicKeys: Uint8Array[]; // Revealed ML-DSA-65 public keys (1952 bytes each)
  signatures: Uint8Array[]; // ML-DSA-65 signatures (3309 bytes each)
  timestamp?: number; // Current time for timelock verification
  hsmAttestation?: string; // HSM attestation proof
}

interface MerkleProofNode {
  hash: string; // Sibling hash
  position: "left" | "right"; // Position relative to computed hash
}
```

## Merkle Tree Construction

### Algorithm

```
1. Serialize each leaf: bytes = canonicalJSON(ScriptLeaf)
2. Hash each leaf: H(L) = SHA-256(bytes)
3. Build tree bottom-up:
   - If odd number of nodes, duplicate last node
   - Parent = SHA-256(left || right) with lexicographic sorting
4. Root = final 32-byte hash
```

### Canonical JSON Serialization

```typescript
function canonicalJSON(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
```

Keys are sorted alphabetically to ensure deterministic serialization.

### Proof Generation

```typescript
function getProof(leafIndex: number): MerkleProofNode[] {
  const proof: MerkleProofNode[] = [];
  let idx = leafIndex;

  for (let level = 0; level < this.levels.length - 1; level++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const position = idx % 2 === 0 ? "right" : "left";
    proof.push({
      hash: this.levels[level][siblingIdx],
      position,
    });
    idx = Math.floor(idx / 2);
  }

  return proof;
}
```

### Proof Verification

```typescript
function verifyProof(
  leaf: ScriptLeaf,
  proof: MerkleProofNode[],
  root: string,
): boolean {
  let hash = sha256hex(canonicalJSON(leaf));

  for (const node of proof) {
    const combined =
      node.position === "left" ? node.hash + hash : hash + node.hash;
    hash = sha256hex(combined);
  }

  return hash === root;
}
```

## Spending Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Spending Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. CONSTRUCT SPEND MESSAGE                                     │
│     ┌────────────────────────────────────────────────────────┐  │
│     │ message = SHA-256(outputId || timestamp)               │  │
│     └────────────────────────────────────────────────────────┘  │
│                                                                 │
│  2. SIGN MESSAGE (off-chain)                                    │
│     ┌────────────────────────────────────────────────────────┐  │
│     │ signature = ML-DSA-65.sign(message, secretKey)         │  │
│     │ // 3309 bytes                                          │  │
│     └────────────────────────────────────────────────────────┘  │
│                                                                 │
│  3. BUILD SPEND PROOF                                           │
│     ┌────────────────────────────────────────────────────────┐  │
│     │ proof = {                                              │  │
│     │   outputId: "uuid",                                    │  │
│     │   revealedLeaf: ScriptLeaf,                            │  │
│     │   merkleProof: [...],                                  │  │
│     │   witness: { publicKeys: [...], signatures: [...] }    │  │
│     │ }                                                      │  │
│     └────────────────────────────────────────────────────────┘  │
│                                                                 │
│  4. VERIFY ON-CHAIN                                             │
│     ┌────────────────────────────────────────────────────────┐  │
│     │ a. Verify Merkle proof: leaf → proof → root            │  │
│     │ b. Verify public key hashes match                      │  │
│     │ c. Execute script condition (off-chain for ML-DSA)     │  │
│     │ d. Mark output as spent                                │  │
│     └────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Script Interpreter

### Verification Logic

```typescript
class P2MRScriptInterpreter {
  constructor(private mlDsaSigner: MlDsaSigner) {}

  verify(
    leaf: ScriptLeaf,
    witness: SpendWitness,
    message: Uint8Array,
  ): ScriptVerificationResult {
    // Step 1: Verify public key hashes
    for (let i = 0; i < witness.publicKeys.length; i++) {
      const keyHash = sha256hex(
        Buffer.from(witness.publicKeys[i]).toString("hex"),
      );
      if (!leaf.publicKeyHashes.includes(keyHash)) {
        return { valid: false, reason: "Public key hash mismatch" };
      }
    }

    // Step 2: Execute condition-specific logic
    switch (leaf.type) {
      case "ml-dsa-65-sig":
        return this.verifySingleSig(witness, message);
      case "timelock":
        return this.verifyTimelock(leaf, witness, message);
      case "multisig-ml-dsa":
        return this.verifyMultisig(leaf, witness, message);
      case "hsm-attested-sig":
        return this.verifyHsmAttested(leaf, witness, message);
    }
  }
}
```

### Leaf Type Handlers

| Type               | Verification Logic                                                |
| ------------------ | ----------------------------------------------------------------- |
| `ml-dsa-65-sig`    | Verify single ML-DSA-65 signature against public key              |
| `timelock`         | Check `witness.timestamp >= leaf.locktime`, then verify signature |
| `multisig-ml-dsa`  | Count valid signatures, ensure `count >= leaf.threshold`          |
| `hsm-attested-sig` | Verify HSM attestation, then verify signature                     |

## Solidity Contract

### P2MRRegistryV1.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract P2MRRegistryV1 is
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    bytes32 public constant OUTPUT_CREATOR_ROLE = keccak256("OUTPUT_CREATOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    struct P2MROutput {
        bytes32 merkleRoot;     // Only commitment stored
        uint256 value;
        uint256 createdAt;
        bool spent;
    }

    mapping(bytes32 => P2MROutput) public outputs;

    event OutputCreated(bytes32 indexed outputId, bytes32 merkleRoot, uint256 value, uint256 timestamp);
    event OutputSpent(bytes32 indexed outputId, bytes32 leafHash, uint256 timestamp);

    function createOutput(bytes32 outputId, bytes32 merkleRoot, uint256 value)
        external
        onlyRole(OUTPUT_CREATOR_ROLE)
        whenNotPaused
    {
        require(outputs[outputId].createdAt == 0, "Output exists");
        outputs[outputId] = P2MROutput({
            merkleRoot: merkleRoot,
            value: value,
            createdAt: block.timestamp,
            spent: false
        });
        emit OutputCreated(outputId, merkleRoot, value, block.timestamp);
    }

    function spendOutput(
        bytes32 outputId,
        bytes32 leafHash,
        bytes32[] calldata merkleProof,
        bool[] calldata proofPositions
    ) external whenNotPaused {
        P2MROutput storage output = outputs[outputId];
        require(output.createdAt != 0, "Output not found");
        require(!output.spent, "Already spent");

        // Verify Merkle proof on-chain
        bytes32 computedHash = leafHash;
        for (uint i = 0; i < merkleProof.length; i++) {
            if (proofPositions[i]) {
                computedHash = keccak256(abi.encodePacked(merkleProof[i], computedHash));
            } else {
                computedHash = keccak256(abi.encodePacked(computedHash, merkleProof[i]));
            }
        }
        require(computedHash == output.merkleRoot, "Invalid proof");

        output.spent = true;
        emit OutputSpent(outputId, leafHash, block.timestamp);
    }

    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}
}
```

### Note on Signature Verification

ML-DSA-65 signature verification is NOT performed on-chain because:

1. No native EVM precompile for ML-DSA
2. Pure Solidity implementation would be extremely gas-expensive
3. Lattice math operations require bigint arithmetic not available in EVM

Instead, signature verification happens off-chain, and the contract trusts the caller to have verified the signature. For consortium networks with permissioned participants, this is acceptable.

## Platform Adapters

### Protocol Port Interface

```typescript
interface P2MRProtocolAdapter<TInvocation> {
  createOutputCommand(output: P2MROutput): TInvocation;
  spendOutputCommand(proof: SpendProof, newOutputs?: P2MROutput[]): TInvocation;
  queryOutputCommand(outputId: string): TInvocation;
}
```

### Besu Adapter

```typescript
class BesuP2MRAdapter implements P2MRProtocolAdapter<BesuP2MRCall> {
  createOutputCommand(output: P2MROutput): BesuP2MRCall {
    return {
      contractName: "P2MRRegistry",
      method: "createOutput",
      args: [output.outputId, output.merkleRoot, output.value.toString()],
      note: `Create P2MR output ${output.outputId}`,
    };
  }

  spendOutputCommand(proof: SpendProof): BesuP2MRCall {
    const leafHash = sha256hex(canonicalJSON(proof.revealedLeaf));
    const proofHashes = proof.merkleProof.map((n) => n.hash);
    const proofPositions = proof.merkleProof.map((n) => n.position === "left");

    return {
      contractName: "P2MRRegistry",
      method: "spendOutput",
      args: [proof.outputId, leafHash, proofHashes, proofPositions],
      note: `Spend P2MR output ${proof.outputId}`,
    };
  }
}
```

## Security Analysis

### Quantum Resistance

| Attack                     | Traditional          | P2MR                   |
| -------------------------- | -------------------- | ---------------------- |
| Harvest now, decrypt later | ✗ Public key exposed | ✓ Only Merkle root     |
| Shor's algorithm           | ✗ Breaks ECDSA       | ✓ ML-DSA uses lattices |
| Grover's algorithm         | ✓ SHA-256 safe       | ✓ SHA-256 safe         |

### Wire Size Comparison

| Component               | ECDSA   | ML-DSA-65 |
| ----------------------- | ------- | --------- |
| Public key              | 33-65 B | 1952 B    |
| Signature               | 64-72 B | 3309 B    |
| Merkle proof (4 leaves) | -       | ~128 B    |
| **Total witness**       | ~137 B  | ~5389 B   |

Trade-off: Larger witness data for quantum resistance.

## Testing Strategy

### Unit Tests

```typescript
describe("MerkleTree", () => {
  test("constructs balanced tree from leaves");
  test("generates valid proof for each leaf");
  test("rejects tampered leaf hash");
  test("handles single-leaf tree");
});

describe("P2MRScriptInterpreter", () => {
  test("verifies valid ML-DSA-65 signature");
  test("rejects signature from wrong key");
  test("enforces timelock expiry");
  test("verifies k-of-n multisig threshold");
});
```

### Property-Based Tests (fast-check)

```typescript
fc.assert(
  fc.property(
    fc.array(scriptLeafArbitrary, { minLength: 1, maxLength: 16 }),
    (leaves) => {
      const tree = new MerkleTree(leaves);
      return leaves.every((_, i) =>
        MerkleTree.verify(leaves[i], tree.getProof(i), tree.root),
      );
    },
  ),
);
```

### E2E Tests (Besu)

```typescript
describe("P2MR on Besu (E2E)", () => {
  test("creates output and verifies storage");
  test("spends output with valid proof");
  test("rejects spend with invalid proof");
  test("rejects double-spend");
});
```

## Related Documentation

- [ADR-0005: P2MR Quantum-Safe Outputs](../adr/ADR-0005-p2mr-merkle-root-outputs.md)
- [Post-Quantum Crypto Skill](../../skills/post-quantum-crypto.md)
- [P2MR Skill](../../skills/p2mr-quantum-safe.md)
- [BIP-360 Draft](https://github.com/cryptoquick/bips/blob/p2qrh/bip-0360.mediawiki)
