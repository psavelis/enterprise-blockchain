# ADR-0003: Hybrid KEM for Post-Quantum Transition

## Status

Accepted

## Context

Cryptographically Relevant Quantum Computers (CRQCs) capable of running Shor's algorithm at scale don't exist yet, but data encrypted today could be harvested for future decryption ("harvest now, decrypt later").

For enterprise blockchain systems handling financial data with 10+ year confidentiality requirements, we need quantum-resistant key exchange. However, post-quantum algorithms are newer and have had less cryptanalysis than classical schemes.

## Decision

We implement **Hybrid KEM** combining X25519 (classical ECDH) with ML-KEM-768 (NIST FIPS 203 lattice-based KEM).

### Construction

```typescript
// Both shared secrets fed into HKDF together
const combinedKey = hkdfSync(
  "sha256",
  Buffer.concat([x25519SharedSecret, kyberSharedSecret]),
  domainSalt,
  "hybrid-kem-v1",
  32,
);
```

### Security Properties

1. **Defense in depth**: Breaking the combined key requires breaking BOTH X25519 AND ML-KEM
2. **Classical security guaranteed**: If ML-KEM is broken, X25519 still protects
3. **Quantum security anticipated**: If X25519 is broken by CRQC, ML-KEM protects
4. **Industry alignment**: Matches Chrome/Firefox/Cloudflare X25519Kyber768 deployment

### Domain-Specific Salt

HKDF uses a domain-specific salt derived from SHA-256:

```typescript
const HKDF_SALT = createHash("sha256")
  .update("enterprise-blockchain:hybrid-kem-v1:salt")
  .digest();
```

This prevents key reuse across different application contexts.

## Consequences

### Positive

- Protection against both classical and quantum adversaries
- Follows proven transition patterns from major browsers
- NIST-standardized algorithms (FIPS 203)

### Negative

- Larger ciphertexts (ML-KEM-768 adds ~2400 bytes)
- Slightly slower than pure classical KEM
- Must maintain both key types during transition period

## References

- `skills/post-quantum-crypto.md` - Full PQ crypto guidance
- `modules/mpc/src/hybrid-kem.ts` - Implementation
- NIST FIPS 203: https://csrc.nist.gov/pubs/fips/203/final
- Chrome X25519Kyber768: https://blog.chromium.org/2023/08/protecting-chrome-traffic-with-hybrid.html
