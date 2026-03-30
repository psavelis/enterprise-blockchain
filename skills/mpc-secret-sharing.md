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

**Field Size**: Additive sharing uses JS `number` (safe integer range). Shamir threshold sharing uses Mersenne prime `2^31 - 1` to stay within safe-integer bounds. Production deployments protecting key material should use larger primes (2^127 - 1 or 2^255 - 19).

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

**Stateful Rounds**: `MPCEngine` maintains computation rounds internally. Parties register, split secrets, submit shares, then compute results.

## Implementation

```typescript
MPCEngine
├── registerParty(party: PartyConfig): void
├── splitSecret(secret: number, partyIds: string[]): SecretShare[]
├── submitShare(computationId: string, share: SecretShare): void
├── compute(computationId: string, op: 'sum' | 'threshold', opts?: { threshold?: number }): ComputationResult
└── verifyIntegrity(computationId: string): boolean

QuantumResistantVault
├── distributeSecret(secret: number, parties: string[], threshold: number): Map<string, ThresholdShare>
├── reconstructSecret(shares: ThresholdShare[], threshold: number): number | null
├── createHashLadder(depth: number): HashLadderKey
└── anchorWithPostQuantumProof(data: string): QuantumResistantAnchor

SecretShare {
  partyId: string
  shareIndex: number
  shareCount: number
  value: number
  nonce: string
  commitment: string
}

ComputationResult (SumResult | ThresholdResult) {
  computationId: string
  op: 'sum' | 'threshold'
  participantCount: number
  aggregate?: number        // sum only
  exceeded?: boolean        // threshold only
  meta: Record<string, string | number | boolean>
  integrityProof: string
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
SHAMIR_PRIME = 2^31 - 1 (Mersenne prime for safe-integer arithmetic)
ADDITIVE_RANGE = ±2^47 (JS number safe range for share values)
HASH_ALGORITHM = SHA-256
COMMITMENT_FORMAT = SHA-256(partyId || shareIndex || value || nonce)
ANCHOR_FORMAT = SHA-256(dataHash || ladderRoot || timestamp)
```

## Related Skills

- [hsm-key-management](hsm-key-management.md) — HSM signing for non-repudiable anchoring
- [integration-adapters](integration-adapters.md) — On-chain result anchoring via Besu adapter

## References

- `modules/mpc/src/index.ts`
- `modules/mpc/src/crypto.ts`
- `modules/mpc/src/quantum.ts`
- `examples/mpc-sealed-bid-auction/index.ts`
- `examples/mpc-joint-risk-analysis/index.ts`
- `examples/quantum-resistant-key-sharing/index.ts`
- `tests/mpc.test.ts`
