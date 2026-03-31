# Post-Quantum Cryptography Transition Guide

Migration strategy for enterprise systems transitioning from classical to quantum-resistant cryptography.

## Timeline Context

Cryptographically Relevant Quantum Computers (CRQCs) capable of breaking RSA-2048 and ECDH-256 don't exist yet. NIST estimates 2030-2035 as earliest feasible dates, but timelines are uncertain. The threat model that drives action today:

**Harvest Now, Decrypt Later**: Adversaries record encrypted traffic today, store it, and decrypt when CRQCs become available. Data with 10+ year confidentiality requirements (financial records, healthcare data, trade secrets) faces exposure risk now.

## NIST Standardization Status

As of FIPS finalization (2024):

| Algorithm          | Standard | Use Case                    | Status |
| ------------------ | -------- | --------------------------- | ------ |
| ML-KEM (Kyber)     | FIPS 203 | Key Encapsulation Mechanism | Final  |
| ML-DSA (Dilithium) | FIPS 204 | Digital Signatures          | Final  |
| SLH-DSA (SPHINCS+) | FIPS 205 | Hash-based Signatures       | Final  |
| FN-DSA (FALCON)    | FIPS 206 | Signatures (compact)        | Draft  |

This repository implements ML-KEM-768 and ML-DSA-65 as primary post-quantum primitives.

## Hybrid Construction

The transition period uses hybrid cryptography: classical + post-quantum algorithms combined such that breaking the scheme requires breaking both.

### Key Encapsulation

X25519 (classical ECDH) combined with ML-KEM-768:

```typescript
// Both shared secrets concatenated and fed into HKDF
const combinedKey = hkdfSync(
  "sha256",
  Buffer.concat([x25519SharedSecret, kyberSharedSecret]),
  domainSalt,
  "hybrid-kem-v1",
  32,
);
```

Security properties:

- If ML-KEM is broken (cryptanalysis breakthrough), X25519 still protects
- If X25519 is broken (CRQC), ML-KEM protects
- Breaking the combined key requires breaking both algorithms

### Digital Signatures

Ed25519 (classical EdDSA) combined with ML-DSA-65:

```typescript
const hybridSignature = {
  classical: ed25519.sign(message, classicalKey),
  postQuantum: mldsa65.sign(message, pqKey),
  algorithm: "Ed25519+ML-DSA-65",
};
```

Verification requires both signatures to validate.

## Migration Phases

### Phase 1: Inventory (Current)

Identify cryptographic usage across the system:

| Usage               | Current Algorithm | PQ Replacement         | Priority |
| ------------------- | ----------------- | ---------------------- | -------- |
| TLS handshake       | X25519            | Hybrid X25519+ML-KEM   | High     |
| Transaction signing | ECDSA P-256       | Hybrid Ed25519+ML-DSA  | High     |
| Key wrapping        | AES-256-GCM       | No change (symmetric)  | N/A      |
| Hash commitments    | SHA-256           | SHA-256 (quantum safe) | N/A      |

Symmetric algorithms (AES-256) and hash functions (SHA-256) require no change—Grover's algorithm provides only quadratic speedup, not exponential.

### Phase 2: Hybrid Deployment

Deploy hybrid cryptography alongside classical:

1. **Key generation**: Generate both classical and PQ key pairs
2. **Encryption**: Use hybrid KEM, store both ciphertexts
3. **Signing**: Generate both signatures, require both for verification
4. **Backward compatibility**: Systems that don't understand PQ can still verify classical components

### Phase 3: PQ-Only

Once confidence in post-quantum algorithms matures (5-10 years after FIPS finalization):

1. Deprecate classical-only verification
2. Reduce hybrid to PQ-only for new deployments
3. Maintain hybrid verification for historical data

## Implementation in This Repository

### Available Modules

```bash
# ML-KEM key exchange example
npm run example:kyber-kem

# Hybrid KEM (X25519 + ML-KEM-768)
npm run example:hybrid-kem

# End-to-end quantum-safe payment
npm run example:quantum-safe-payment
```

### Module API

```typescript
import { KyberKem, HybridKem, ML_KEM_SIZES } from "@enterprise-blockchain/mpc";

// Pure ML-KEM-768
const kem = new KyberKem();
const keyPair = kem.generateKeyPair("ml-kem-768");
const { ciphertext, sharedSecret } = kem.encapsulate(
  keyPair.publicKey,
  "ml-kem-768",
);
const decrypted = kem.decapsulate(ciphertext, keyPair.secretKey, "ml-kem-768");

// Hybrid KEM
const hybridKem = new HybridKem();
const keyPairs = hybridKem.generateKeyPairs();
const encapsulation = hybridKem.encapsulate(
  keyPairs.x25519.publicKey,
  keyPairs.kyber.publicKey,
);
```

### Key Sizes

ML-KEM-768 adds overhead compared to X25519:

| Component     | X25519   | ML-KEM-768 | Hybrid Total        |
| ------------- | -------- | ---------- | ------------------- |
| Public key    | 32 bytes | 1184 bytes | 1216 bytes          |
| Secret key    | 32 bytes | 2400 bytes | 2432 bytes          |
| Ciphertext    | 32 bytes | 1088 bytes | 1120 bytes          |
| Shared secret | 32 bytes | 32 bytes   | 32 bytes (combined) |

Storage and bandwidth requirements increase roughly 35x for key material.

## Protocol-Specific Considerations

### Hyperledger Fabric

Fabric 2.x uses ECDSA for transaction signing. Hybrid migration requires:

1. Update chaincode signature verification to accept hybrid signatures
2. Modify MSP identity certificates to include PQ public keys
3. Update endorsement policy validators

### Hyperledger Besu

Besu uses secp256k1 for transaction signing (Ethereum standard). Migration options:

1. EIP-7747 (draft): Account abstraction for PQ signatures
2. L2 solutions with PQ validation
3. Consortium-specific precompiles for hybrid verification

### R3 Corda

Corda supports pluggable cryptography. Add PQ providers to:

1. Node configuration (cordapp deployment)
2. Network parameters (consortium-wide)
3. Flow signature verification

## Testing PQ Implementations

Property-based tests verify PQ invariants:

```typescript
// Implicit rejection: wrong key produces different shared secret
test("ML-KEM: wrong secret key fails to decrypt", () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      const keyPair1 = kem.generateKeyPair("ml-kem-768");
      const keyPair2 = kem.generateKeyPair("ml-kem-768");
      const encapsulation = kem.encapsulate(keyPair1.publicKey, "ml-kem-768");
      const wrongDecap = kem.decapsulate(
        encapsulation.ciphertext,
        keyPair2.secretKey,
        "ml-kem-768",
      );
      // Must be different (implicit rejection)
      return !arraysEqual(encapsulation.sharedSecret, wrongDecap);
    }),
    { numRuns: 10 },
  );
});
```

See [testing-guide.md](testing-guide.md) for full property test documentation.

## Decision Record

The hybrid KEM design decision is documented in [ADR-0003](../adr/ADR-0003-hybrid-kem-design.md).

## References

- [NIST FIPS 203 (ML-KEM)](https://csrc.nist.gov/pubs/fips/203/final)
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
- [Chrome X25519Kyber768](https://blog.chromium.org/2023/08/protecting-chrome-traffic-with-hybrid.html)
- [Cloudflare PQ Deployment](https://blog.cloudflare.com/post-quantum-to-origins/)
- [NSA CNSA 2.0](https://www.nsa.gov/Cybersecurity/NSA-Cybersecurity-News/Article-View/Article/3725979/)
