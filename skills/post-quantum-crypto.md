# Post-Quantum Cryptography

Quantum-resistant patterns for future-proof data anchoring and key distribution.

## When to Use

- Anchoring data that must remain tamper-evident beyond 2030
- Distributing secrets that require long-term confidentiality (10+ years)
- Implementing hybrid classical/post-quantum schemes for transition period
- Creating non-repudiable audit trails resistant to quantum attack

## When NOT to Use

- Short-lived session keys (classical crypto sufficient)
- Real-time signing where latency is critical (PQ algorithms are slower)
- Systems without upgrade path (cannot retrofit existing signatures)

## Key Concepts

**Hash-Ladder Anchoring**: Chain of SHA-256 hashes creating temporal binding. Each rung commits to previous, creating unforgeable sequence. Quantum computers cannot reverse SHA-256.

**Hybrid KEM**: Combine classical ECDH with ML-KEM (Kyber). Shared secret = HKDF(ECDH_secret || ML-KEM_secret). Security holds if either algorithm is secure.

**ML-KEM (Kyber)**: NIST-standardized lattice-based key encapsulation. Quantum-resistant. Key sizes: ML-KEM-512 (1632 bytes pk), ML-KEM-768 (2400 bytes pk), ML-KEM-1024 (3168 bytes pk).

**ML-DSA (Dilithium)**: NIST-standardized lattice-based digital signature. Quantum-resistant. Signature sizes larger than ECDSA (~2500 bytes for ML-DSA-65).

**Threshold Distribution**: Combine Shamir SSS with hash-ladder anchoring. Shares distributed via classical channel; reconstruction proof anchored with hash ladder.

## Architecture

```
modules/mpc/src/
├── quantum.ts  → QuantumResistantVault, HashLadderKey, QuantumResistantAnchor
├── crypto.ts   → Field arithmetic, random generation (classical)
└── index.ts    → MPCEngine (classical), QuantumResistantVault export

Integration Points
├── modules/hsm/src/  → HSM stores classical keys; PQ keys in software vault
└── modules/protocols/besu/src/  → Anchor PQ proofs to EVM contract
```

## Implementation

```typescript
QuantumResistantVault
├── distributeSecret(secret: number, parties: string[], threshold: number): Map<string, ThresholdShare>
├── reconstructSecret(shares: ThresholdShare[], threshold: number): number | null
├── createHashLadder(depth: number): HashLadderKey
└── anchorWithPostQuantumProof(data: string): QuantumResistantAnchor

HashLadderKey {
  depth: number
  rungs: string[]       // SHA-256 chain
  root: string          // Final hash (anchor point)
}

QuantumResistantAnchor {
  dataHash: string      // SHA-256(data)
  ladderRoot: string    // Hash ladder commitment
  timestamp: number     // Anchor time
  proof: string         // Combined proof hash
}

ThresholdShare {
  partyId: string
  x: number             // Polynomial evaluation point
  y: number             // Share value f(x)
  threshold: number
  totalParties: number
}
```

## Decision Tree: When to Use PQ

```
Is data lifetime > 10 years?
├── Yes → Use hybrid KEM for encryption
│         Use hash-ladder for anchoring
└── No  → Is adversary state-level?
          ├── Yes → Use hybrid KEM (harvest-now-decrypt-later threat)
          └── No  → Classical crypto acceptable
```

## Cryptographic Constants

```
SHAMIR_PRIME = 2^31 - 1 (Mersenne prime, safe-integer arithmetic)
HASH_ALGORITHM = SHA-256 (quantum-resistant)
LADDER_DEFAULT_DEPTH = 256
ANCHOR_FORMAT = SHA-256(dataHash || ladderRoot || timestamp)
```

## Must-Preserve Invariants

1. **Reconstruction threshold**: `reconstructSecret()` returns null if `shares.length < threshold`
2. **Ladder immutability**: Hash ladder rungs computed once; never modified after creation
3. **Anchor binding**: `QuantumResistantAnchor.proof` binds data hash to ladder root and timestamp
4. **Share independence**: Each `ThresholdShare` reveals nothing about secret without k-1 other shares
5. **Prime field arithmetic**: All Shamir operations use modular arithmetic over `SHAMIR_PRIME`

## Security Properties

| Property                          | Mechanism                          |
| --------------------------------- | ---------------------------------- |
| Quantum-resistant confidentiality | Shamir SSS (information-theoretic) |
| Quantum-resistant integrity       | SHA-256 hash ladder                |
| Temporal binding                  | Timestamp in anchor proof          |
| Threshold availability            | k-of-n reconstruction              |
| Forward secrecy                   | New ladder per anchor session      |

## Anti-patterns

**Using PQ for everything**: Post-quantum algorithms have larger keys and slower operations. Apply selectively to long-lived secrets and anchors.

**Standalone ML-KEM without hybrid**: During transition period, use hybrid KEM. Pure ML-KEM has less real-world validation than ECDH.

**Ignoring reconstruction failure**: `reconstructSecret()` returns null on insufficient shares. Always check return value:

```typescript
const secret = vault.reconstructSecret(shares, threshold);
if (secret === null) {
  throw new Error("Insufficient shares for reconstruction");
}
```

**Shallow hash ladders**: Ladder depth should match expected verification lifetime. 256 rungs supports years of periodic re-anchoring.

**Storing ladder root without rungs**: Verification requires intermediate rungs. Store full `HashLadderKey`, not just root.

## Migration Path

1. **Inventory**: Identify data with >10 year confidentiality requirements
2. **Hybrid adoption**: Wrap existing ECDH with ML-KEM hybrid
3. **Anchor upgrade**: Add hash-ladder proofs alongside existing signatures
4. **Signature transition**: Migrate to ML-DSA when ecosystem support matures

## Related Skills

- [mpc-secret-sharing](mpc-secret-sharing.md) — Classical MPC arithmetic underlying threshold distribution
- [hsm-key-management](hsm-key-management.md) — HSM integration for classical keys in hybrid schemes

## References

- `modules/mpc/src/quantum.ts`
- `examples/quantum-resistant-key-sharing/index.ts`
- NIST FIPS 203 (ML-KEM)
- NIST FIPS 204 (ML-DSA)
