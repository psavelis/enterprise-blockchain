# MPC Secret Sharing

Multi-party computation patterns for confidential joint computation.

## When to Use

- Sealed-bid auctions where bids must remain hidden until reveal
- Aggregate analytics across competitors without exposing individual inputs
- Threshold authorization requiring k-of-n parties to reconstruct secrets
- Off-chain computation with on-chain result anchoring

## When NOT to Use

- Single-party encryption (use envelope encryption)
- Public verifiability requirements (use ZK proofs)
- Real-time computation with strict latency bounds

## Key Concepts

**Additive Secret Sharing**: Secret `s` splits into `n` shares where `s = Σ shares (mod p)`. Reconstruction requires all shares. Information-theoretically secure: any n-1 shares reveal nothing.

**Shamir Threshold Sharing**: k-of-n scheme using polynomial interpolation. Any k shares reconstruct; fewer than k reveal nothing. Based on Lagrange interpolation over finite field.

**Commitment Verification**: Party commits to share before reveal: `commitment = SHA-256(partyId || value || nonce)`. Prevents post-hoc manipulation.

**Field Size**: Operations use 256-bit prime field (2^256 - 189). Aligns with blockchain hash outputs. Prevents wrap-around attacks on small fields.

## Architecture

```
Domain Layer (modules/mpc/src/)
├── crypto.ts   → Field arithmetic, random generation
├── index.ts    → MpcEngine (additive), QuantumResistantVault (Shamir)
└── quantum.ts  → Hash-ladder anchoring

Integration Points
├── modules/protocols/besu/src/index.ts  → anchorOrder (result commitment)
└── modules/hsm/src/index.ts             → Sign result proofs
```

**Separation of Concerns**: `MpcEngine` handles share arithmetic. `QuantumResistantVault` handles threshold distribution. Neither knows about blockchain protocols.

**Stateless Sessions**: `MpcEngine.createSession()` returns session ID. All state stored externally. Engine is pure computation.

## Implementation

```typescript
MpcEngine
├── createSession(parties: string[]): string
├── splitSecret(secret: bigint, parties: string[]): Map<string, Share>
├── submitShare(sessionId: string, partyId: string, value: bigint, commitment?: string)
├── compute(sessionId: string): ComputeResult
└── verifyCommitment(share: Share): boolean

QuantumResistantVault
├── distributeSecret(secret: Buffer, parties: string[], threshold: number): Share[]
├── reconstruct(shares: Share[]): Buffer | null
└── anchor(commitment: Buffer): AnchorProof

Share {
  partyId: string
  value: bigint
  commitment?: string
  nonce?: string
}

ComputeResult {
  result: bigint
  integrityProof: string
  commitmentsVerified: boolean
}
```

## Security Properties

| Property        | Mechanism                                          |
| --------------- | -------------------------------------------------- |
| Confidentiality | Information-theoretic security from secret sharing |
| Integrity       | Commitment verification before computation         |
| Availability    | Threshold allows k-of-n reconstruction             |
| Non-repudiation | Hash-ladder anchoring with HSM signatures          |

## Anti-patterns

**Skipping commitment verification**: Without commitments, malicious party can submit crafted share biasing result. Always require `commitment` parameter.

**Small field sizes**: Field size < 2^128 allows brute-force enumeration. Use 256-bit prime field.

**Threshold equals party count**: If k = n, single absent party blocks reconstruction. Use k < n for availability.

**Partial share submission**: `compute()` rejects incomplete sets. Ensure all parties submit before calling.

**Reusing session IDs**: Each computation requires fresh session. Session reuse leaks correlation between computations.

**Ignoring reconstruction failure**: `QuantumResistantVault.reconstruct()` returns null if threshold not met. Always check return value.

## Cryptographic Constants

```
FIELD_PRIME = 2^256 - 189
HASH_ALGORITHM = SHA-256
COMMITMENT_FORMAT = SHA-256(partyId || value || nonce)
ANCHOR_FORMAT = SHA-256(result || timestamp || participantIds)
```

## References

- `modules/mpc/src/index.ts`
- `modules/mpc/src/crypto.ts`
- `modules/mpc/src/quantum.ts`
- `examples/mpc-sealed-bid-auction/index.ts`
- `examples/mpc-joint-risk-analysis/index.ts`
- `examples/quantum-resistant-key-sharing/index.ts`
- `tests/mpc.test.ts`
