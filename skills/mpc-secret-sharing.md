# Skill: MPC Secret Sharing Patterns

## When to use

When multiple parties need to compute a result jointly without revealing their individual inputs — sealed-bid auctions, aggregate risk analysis, or threshold authorization.

## Key concepts

- **Additive secret sharing**: A secret `s` is split into `n` shares where `s = share_1 + share_2 + ... + share_n` (mod field size). No single share reveals anything.
- **Shamir threshold sharing**: `k`-of-`n` threshold scheme. Any `k` shares reconstruct the secret via Lagrange interpolation; fewer than `k` reveals nothing.
- **Commitment verification**: Each participant commits to their share (e.g., `SHA-256(participantId || shareValue || nonce)`) before revealing. During computation, commitments are verified to detect tampering.
- **Field size**: Operations use a 256-bit prime field (`2^256 - 189`) to align with blockchain hash outputs and prevent wrap-around attacks on small fields.

## Implementation pattern

```
MpcEngine
  ├── createSession(participants, threshold?) → sessionId
  ├── submitShare(sessionId, participantId, value, commitment?) → void
  ├── compute(sessionId) → { result, integrityProof, commitmentsVerified }
  └── reconstruct(shares, threshold) → secret  (Shamir)
```

- `submitShare()` verifies commitments before accepting if a commitment was provided.
- `compute()` sums all shares modulo the field prime and produces an integrity proof (SHA-256 of participant IDs + result + commitment verification status).
- Shamir reconstruction uses Lagrange basis polynomials evaluated at x=0.

## Pitfalls

- Always verify commitments — without them, a malicious participant can submit a crafted share that biases the result.
- Ensure the field prime is large enough (256-bit) — small fields allow brute-force enumeration of possible shares.
- Threshold `k` must be strictly less than `n` for Shamir; if `k == n`, use additive sharing instead (simpler).
- Shares must be submitted by all expected participants before `compute()` — partial sets are rejected.

## References

- `modules/mpc/src/index.ts`
- `examples/mpc-sealed-bid-auction/index.ts`
- `examples/mpc-joint-risk-analysis/index.ts`
- `examples/quantum-resistant-key-sharing/index.ts`
- `tests/mpc.test.ts`
