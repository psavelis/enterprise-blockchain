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
- Long-term secret storage (see [post-quantum-crypto](post-quantum-crypto.md))

## Key Concepts

**Additive Secret Sharing**: Secret `s` splits into `n` shares where `s = Σ shares (mod p)`. Reconstruction requires all shares. Information-theoretically secure: any n-1 shares reveal nothing.

**Shamir Threshold Sharing**: k-of-n scheme using polynomial interpolation. Any k shares reconstruct; fewer than k reveal nothing. Based on Lagrange interpolation over finite field.

**Commitment Verification**: Party commits to share before reveal: `commitment = SHA-256(partyId || shareIndex || value || nonce)`. Prevents post-hoc manipulation.

**Field Size**: Additive sharing uses JS `number` (safe integer range). Shamir uses Mersenne prime `2^31 - 1` for safe-integer arithmetic. Production deployments use larger primes.

## Architecture

```
Domain Layer (modules/mpc/src/)
├── crypto.ts   → randomFieldElement(), modPow(), extendedGcd()
├── index.ts    → MPCEngine (additive sharing)
└── quantum.ts  → QuantumResistantVault (Shamir + hash ladders)

Integration Points
├── modules/protocols/besu/src/index.ts  → anchorOrder (result commitment)
└── modules/hsm/src/index.ts             → Sign result proofs
```

**Separation of Concerns**: `MPCEngine` handles additive share arithmetic. `QuantumResistantVault` handles Shamir threshold distribution. Neither knows about blockchain protocols.

## Implementation

```typescript
MPCEngine
├── registerParty(party: PartyConfig): void
├── splitSecret(secret: number, partyIds: string[]): SecretShare[]
├── submitShare(computationId: string, share: SecretShare): void
├── compute(computationId: string, op: 'sum' | 'threshold', opts?: ComputeOptions): ComputationResult
└── verifyIntegrity(computationId: string): boolean

PartyConfig {
  partyId: string
  publicKey?: string
}

SecretShare {
  partyId: string
  shareIndex: number
  shareCount: number
  value: number
  nonce: string
  commitment: string
}

ComputeOptions {
  threshold?: number  // For 'threshold' operation
}

ComputationResult = SumResult | ThresholdResult

SumResult {
  computationId: string
  op: 'sum'
  participantCount: number
  aggregate: number
  meta: Record<string, string | number | boolean>
  integrityProof: string
}

ThresholdResult {
  computationId: string
  op: 'threshold'
  participantCount: number
  exceeded: boolean
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
| Non-repudiation | Result anchoring with HSM signatures               |

## Cryptographic Constants

```
SHAMIR_PRIME = 2^31 - 1 (Mersenne prime for safe-integer arithmetic)
ADDITIVE_RANGE = ±2^47 (JS number safe range for share values)
HASH_ALGORITHM = SHA-256
COMMITMENT_FORMAT = SHA-256(partyId || shareIndex || value || nonce)
```

## Must-Preserve Invariants

1. **Commitment verification**: `compute()` verifies all commitments before aggregation
2. **Complete share sets**: `compute()` rejects incomplete share submissions
3. **Session isolation**: Each `computationId` is fresh; reuse leaks correlation
4. **Threshold semantics**: `ThresholdResult.exceeded` is boolean, not aggregate value
5. **Integrity proof binding**: `integrityProof` covers all submitted shares

## Anti-patterns

**Skipping commitment verification**: Without commitments, malicious party can submit crafted share biasing result. Always verify commitments.

**Small field sizes in production**: Field size < 2^128 allows brute-force enumeration. Current implementation uses 2^31-1 for demo; production needs 256-bit prime.

**Threshold equals party count**: If k = n, single absent party blocks reconstruction. Use k < n for availability.

**Partial share submission**: `compute()` rejects incomplete sets. Ensure all parties submit before calling.

**Reusing session IDs**: Each computation requires fresh session. Session reuse leaks correlation between computations.

**Ignoring operation type**: `SumResult` has `aggregate`; `ThresholdResult` has `exceeded`. Type-guard before accessing:

```typescript
if (result.op === "sum") {
  console.log(result.aggregate);
} else {
  console.log(result.exceeded);
}
```

## Related Skills

- [hsm-key-management](hsm-key-management.md) — HSM signing for non-repudiable anchoring
- [post-quantum-crypto](post-quantum-crypto.md) — Shamir SSS with hash-ladder anchoring
- [integration-adapters](integration-adapters.md) — On-chain result anchoring via Besu adapter

## References

- `modules/mpc/src/index.ts`
- `modules/mpc/src/crypto.ts`
- `examples/mpc-sealed-bid-auction/index.ts`
- `examples/mpc-joint-risk-analysis/index.ts`
- `tests/mpc.test.ts`
