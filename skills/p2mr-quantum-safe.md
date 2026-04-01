# P2MR: Pay-to-Merkle-Root Quantum-Safe Outputs

BIP-360-inspired pattern for quantum-proof transaction outputs using Merkle root commitments.

## When to Use

- Creating outputs that must remain quantum-safe for 10+ years
- Multi-condition spending scenarios (normal, dispute resolution, forced settlement)
- Timelocked outputs with multiple fallback conditions
- Multi-party threshold spending (k-of-n ML-DSA-65 signatures)
- HSM-attested spending requirements

## When NOT to Use

- Simple single-key outputs with short lifetimes (<2 years)
- High-frequency trading where witness size matters (ML-DSA-65 sigs are 3309 bytes)
- Outputs already protected by existing hash-ladder anchoring
- Systems that cannot handle larger witness data

## Key Concepts

**Pay-to-Merkle-Root (P2MR)**: On-chain output contains ONLY the Merkle root of a script tree. No public keys stored on-chain until spend time. Eliminates "harvest now, decrypt later" quantum threat.

**Script Tree**: Binary tree of spending conditions. Each leaf is a `ScriptLeaf` containing:

- Spending condition type (signature, timelock, multisig, HSM-attested)
- Public key hashes (SHA-256 of ML-DSA-65 public keys)
- Condition parameters (threshold, locktime, HSM slot)

**Spend Proof**: To spend a P2MR output, reveal:

1. The leaf script being satisfied
2. Merkle proof (path from leaf to root)
3. Witness (public keys + signatures)

**ML-DSA-65**: NIST FIPS 204 lattice-based signature algorithm. Quantum-resistant. Public key: 1952 bytes, signature: 3309 bytes.

## Architecture

```
modules/p2mr/
├── src/
│   ├── index.ts                    # Public exports
│   ├── merkle-tree.ts              # MerkleTree class
│   ├── script-leaf.ts              # ScriptLeaf types and validation
│   ├── p2mr-output.ts              # P2MROutput creation
│   ├── spend-proof.ts              # SpendProof validation
│   ├── script-interpreter.ts       # Script execution engine
│   └── types.ts                    # Shared type definitions
└── package.json

Integration Points
├── modules/mpc/src/dsa.ts          → ML-DSA-65 signature verification
├── modules/hsm/src/                → HSM attestation verification
└── modules/protocols/besu/src/p2mr-adapter.ts → Besu contract calls
```

## Implementation

```typescript
// Script leaf types
type ScriptLeafType =
  | "ml-dsa-65-sig" // Single ML-DSA-65 signature
  | "timelock" // Time-locked signature
  | "multisig-ml-dsa" // k-of-n threshold
  | "hsm-attested-sig"; // HSM-backed signature

interface ScriptLeaf {
  type: ScriptLeafType;
  publicKeyHashes: string[]; // SHA-256 of ML-DSA-65 public keys
  threshold?: number; // For multisig
  locktime?: number; // Unix timestamp for timelock
  hsmSlotId?: string; // HSM slot for attestation
}

interface P2MROutput {
  outputId: string; // UUID v4
  merkleRoot: string; // 64 hex chars (SHA-256)
  value: bigint; // Amount in base units
  createdAt: number; // Block timestamp
}

interface SpendProof {
  outputId: string;
  revealedLeaf: ScriptLeaf;
  merkleProof: MerkleProofNode[];
  witness: SpendWitness;
}

// MerkleTree API
class MerkleTree {
  constructor(leaves: ScriptLeaf[]);
  get root(): string; // SHA-256 hex root
  get leaves(): ScriptLeaf[];
  getProof(leafIndex: number): MerkleProofNode[];
  static verify(
    leaf: ScriptLeaf,
    proof: MerkleProofNode[],
    root: string,
  ): boolean;
}

// Script interpreter
class P2MRScriptInterpreter {
  constructor(mlDsaSigner: MlDsaSigner);
  verify(
    leaf: ScriptLeaf,
    witness: SpendWitness,
    message: Uint8Array,
  ): ScriptVerificationResult;
}
```

## Merkle Tree Construction

```
1. Leaf hash = SHA-256(canonicalJSON(ScriptLeaf))
2. Internal node = SHA-256(left || right)  // lexicographic sorting
3. Odd leaf count: duplicate last leaf
4. Root = final 32-byte hash (64 hex chars)
```

## Verification Flow

```
1. Verify Merkle proof: leaf → proof → root matches output.merkleRoot
2. Verify public key hashes: SHA-256(witness.publicKey) ∈ leaf.publicKeyHashes
3. Execute condition-specific logic:
   - ml-dsa-65-sig: verify ML-DSA-65 signature
   - timelock: check witness.timestamp >= leaf.locktime, then verify signature
   - multisig-ml-dsa: count valid signatures >= leaf.threshold
   - hsm-attested-sig: verify HSM attestation, then verify signature
4. Return verification result with audit trail
```

## Decision Tree: Leaf Type Selection

```
Is output conditional on time?
├── Yes → timelock (with locktime parameter)
└── No  → Is multi-party authorization required?
          ├── Yes → How many parties?
          │         ├── k-of-n threshold → multisig-ml-dsa
          │         └── All parties      → multisig-ml-dsa (threshold = n)
          └── No  → Is HSM attestation required?
                    ├── Yes → hsm-attested-sig
                    └── No  → ml-dsa-65-sig
```

## Must-Preserve Invariants

1. **No public keys on-chain**: Only Merkle root stored; keys revealed only at spend time
2. **SHA-256 throughout**: All hashes use SHA-256 for quantum resistance
3. **Canonical JSON serialization**: ScriptLeaf serialization must be deterministic
4. **Proof verification before script**: Always verify Merkle proof before executing script
5. **Message commitment**: Spend message must commit to outputId to prevent replay
6. **Threshold enforcement**: Multisig must verify exactly threshold valid signatures

## Security Properties

| Property                       | Mechanism                                  |
| ------------------------------ | ------------------------------------------ |
| Quantum-resistant storage      | Only Merkle root on-chain (no public keys) |
| Quantum-resistant verification | ML-DSA-65 (NIST FIPS 204)                  |
| Hash collision resistance      | SHA-256 (128-bit post-quantum security)    |
| Replay prevention              | Spend message includes outputId            |
| Timelock enforcement           | On-chain block.timestamp verification      |
| Multi-party authorization      | Threshold signature verification           |

## Anti-patterns

**Storing public keys with output**: Defeats the purpose of P2MR. Only store the Merkle root.

**Using ECDSA in script leaves**: ECDSA is quantum-vulnerable. Use ML-DSA-65 exclusively.

**Single-leaf trees for simple outputs**: Wastes gas on Merkle proof verification. Use traditional outputs for short-lived single-key spending.

**Reusing output IDs**: Each output must have a unique UUID. Reuse enables replay attacks.

**Shallow threshold in multisig**: If threshold = 1, any single party can spend. Set threshold appropriately for security requirements.

```typescript
// Anti-pattern: threshold too low
const leaf: ScriptLeaf = {
  type: "multisig-ml-dsa",
  publicKeyHashes: [hashA, hashB, hashC],
  threshold: 1, // BAD: any single party can spend
};

// Correct: meaningful threshold
const leaf: ScriptLeaf = {
  type: "multisig-ml-dsa",
  publicKeyHashes: [hashA, hashB, hashC],
  threshold: 2, // GOOD: requires cooperation
};
```

**Ignoring Merkle proof verification failures**: Always check proof validity before accepting spend.

```typescript
// Anti-pattern: ignoring proof verification
const result = interpreter.verify(leaf, witness, message);
// Proceed without checking Merkle proof!

// Correct: verify proof first
if (
  !MerkleTree.verify(proof.revealedLeaf, proof.merkleProof, output.merkleRoot)
) {
  throw new Error("Invalid Merkle proof");
}
const result = interpreter.verify(leaf, witness, message);
```

## Example: Three-Organization Settlement

```typescript
// Bank A creates P2MR output with three spending conditions
const scriptTree = new MerkleTree([
  // Leaf 0: Normal settlement (Bank B signature)
  { type: "ml-dsa-65-sig", publicKeyHashes: [sha256hex(bankB.publicKey)] },

  // Leaf 1: Dispute resolution (Bank A + Clearing House 2-of-2)
  {
    type: "multisig-ml-dsa",
    publicKeyHashes: [
      sha256hex(bankA.publicKey),
      sha256hex(clearingHouse.publicKey),
    ],
    threshold: 2,
  },

  // Leaf 2: Forced settlement (Clearing House + 30-day timelock)
  {
    type: "timelock",
    publicKeyHashes: [sha256hex(clearingHouse.publicKey)],
    locktime: Date.now() + 30 * 24 * 60 * 60 * 1000,
  },
]);

const output: P2MROutput = {
  outputId: randomUUID(),
  merkleRoot: scriptTree.root,
  value: 10_000_000_00n, // 10M EUR
  createdAt: Date.now(),
};

// Bank B spends via Leaf 0
const proof: SpendProof = {
  outputId: output.outputId,
  revealedLeaf: scriptTree.leaves[0],
  merkleProof: scriptTree.getProof(0),
  witness: {
    publicKeys: [bankB.publicKey],
    signatures: [signature],
  },
};
```

## Related Skills

- [post-quantum-crypto](post-quantum-crypto.md) — ML-DSA-65, ML-KEM, hybrid schemes
- [hsm-key-management](hsm-key-management.md) — HSM integration for key storage
- [mpc-secret-sharing](mpc-secret-sharing.md) — Threshold schemes for key custody

## References

- `modules/p2mr/src/` — P2MR implementation
- `modules/mpc/src/dsa.ts` — ML-DSA-65 signer
- `contracts/solidity/src/P2MRRegistryV1.sol` — Solidity contract
- `examples/quantum-safe-merkle-root-payment/` — Capstone example
- [BIP-360 Draft](https://github.com/cryptoquick/bips/blob/p2qrh/bip-0360.mediawiki)
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
