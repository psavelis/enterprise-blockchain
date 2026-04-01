# ADR-0005: P2MR (Pay-to-Merkle-Root) Quantum-Safe Outputs

## Status

Accepted

## Context

Cryptographically Relevant Quantum Computers (CRQCs) capable of running Shor's algorithm don't exist yet, but the "harvest now, decrypt later" threat is real: adversaries can collect encrypted data and blockchain outputs today for future quantum decryption.

Traditional blockchain output patterns expose public keys:

| Pattern          | Public Key Exposure          |
| ---------------- | ---------------------------- |
| P2PKH            | At spend time (in scriptSig) |
| P2WPKH           | At spend time (in witness)   |
| P2TR key-path    | At spend time (in witness)   |
| Enterprise state | Often in state/participants  |

Even with post-quantum signatures (ML-DSA-65), if the public key is stored on-chain before spending, a quantum adversary could:

1. Harvest the public key from the blockchain
2. Use Shor's algorithm to derive the private key
3. Race to spend the output before the legitimate owner

BIP-360 proposes a solution: **Pay-to-Merkle-Root (P2MR)**, where only a Merkle root commitment is stored on-chain, with no public key exposure until the moment of spending.

## Decision

We implement a **BIP-360-inspired P2MR pattern** adapted for enterprise blockchain platforms (Besu, Fabric, Corda).

### Core Design

1. **On-chain commitment**: Only the Merkle root of a script tree is stored
2. **Script leaves**: Each leaf contains a spending condition with public key HASHES (not keys)
3. **Spend proof**: Reveal leaf + Merkle proof + witness (public keys + signatures)
4. **Signature algorithm**: ML-DSA-65 (NIST FIPS 204) exclusively

### Script Leaf Types

```typescript
type ScriptLeafType =
  | "ml-dsa-65-sig" // Single signature
  | "timelock" // Time-locked signature
  | "multisig-ml-dsa" // k-of-n threshold
  | "hsm-attested-sig"; // HSM-backed signature
```

### Merkle Tree Construction

```
Leaf hash = SHA-256(canonicalJSON(ScriptLeaf))
Internal node = SHA-256(left || right)  // lexicographic sorting
```

SHA-256 is used throughout for quantum resistance (Grover reduces to 128-bit security, still sufficient).

### Solidity Implementation

We use OpenZeppelin's UUPS upgradeable proxy pattern:

```solidity
contract P2MRRegistryV1 is
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    struct P2MROutput {
        bytes32 merkleRoot;     // Only commitment—NO public keys
        uint256 value;
        uint256 createdAt;
        bool spent;
    }

    mapping(bytes32 => P2MROutput) public outputs;

    function spendOutput(
        bytes32 outputId,
        bytes32 leafHash,
        bytes32[] calldata merkleProof,
        bool[] calldata proofPositions
    ) external whenNotPaused {
        // Verify Merkle proof on-chain
        // Signature verification happens off-chain (ML-DSA-65 not EVM-native)
    }
}
```

### Why UUPS Upgradeable?

1. **Bug fixes**: Post-quantum cryptography is evolving; we may need to fix issues
2. **Algorithm updates**: NIST may update ML-DSA parameters
3. **Gas optimization**: Future versions can optimize proof verification
4. **Access control**: OpenZeppelin's proven role-based permissions

### Platform Adapters

| Platform | Implementation                   | E2E Testing         |
| -------- | -------------------------------- | ------------------- |
| Besu     | Full adapter with contract calls | Live node E2E in CI |
| Fabric   | Mock adapter (projection only)   | Unit tests only     |
| Corda    | Mock adapter (projection only)   | Unit tests only     |

Besu is prioritized because:

- EVM-compatible contracts can verify Merkle proofs on-chain
- Docker images are public (no R3 registry needed for Corda)
- Existing E2E infrastructure in CI

## Consequences

### Positive

- **Quantum-safe storage**: No public keys on-chain until spend time
- **Multi-condition outputs**: Script tree supports complex spending scenarios
- **Defense in depth**: Even if ML-DSA-65 is weakened, hash-based commitment provides additional protection
- **Upgradeable**: UUPS pattern allows contract evolution
- **Auditable**: Merkle proofs provide cryptographic audit trail

### Negative

- **Larger witness data**: ML-DSA-65 signatures are 3309 bytes (vs 64-72 bytes for ECDSA)
- **Off-chain script tree management**: Spender must store full script tree
- **Gas costs**: Merkle proof verification adds gas overhead
- **Complexity**: More complex than traditional single-key outputs

### Wire Size Comparison

| Component             | ECDSA (bytes) | ML-DSA-65 (bytes) |
| --------------------- | ------------- | ----------------- |
| Public key            | 33-65         | 1952              |
| Signature             | 64-72         | 3309              |
| Total witness (1 sig) | ~137          | ~5261             |

### Migration Path

1. **New outputs**: Create as P2MR with ML-DSA-65 script leaves
2. **Existing outputs**: No migration possible (already exposed)
3. **Hybrid period**: Applications can use both patterns during transition

## Alternatives Considered

### Alternative 1: Hash-Ladder Only

Store SHA-256 hash chain anchors without Merkle tree.

**Rejected**: Does not support multi-condition spending or complex authorization.

### Alternative 2: Pure ML-DSA-65 Without P2MR

Store ML-DSA-65 public keys directly on-chain.

**Rejected**: Public key exposure enables quantum attack on long-lived outputs.

### Alternative 3: P2TR-Style Hybrid

Store internal key + Merkle root (like Bitcoin's P2TR).

**Rejected**: Internal key is still quantum-vulnerable. BIP-360's script-only approach is cleaner.

## References

- `skills/p2mr-quantum-safe.md` — Skill file
- `modules/p2mr/src/` — Implementation
- `contracts/solidity/src/P2MRRegistryV1.sol` — Solidity contract
- `examples/quantum-safe-merkle-root-payment/` — Capstone example
- [BIP-360 Draft](https://github.com/cryptoquick/bips/blob/p2qrh/bip-0360.mediawiki)
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
- [ADR-0003](ADR-0003-hybrid-kem-design.md) — Hybrid KEM for key exchange
