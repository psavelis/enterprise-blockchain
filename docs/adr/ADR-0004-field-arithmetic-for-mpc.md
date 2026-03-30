# ADR-0004: Field Arithmetic Parameters for MPC

## Status

Accepted (Demo Configuration)

## Context

Secret sharing schemes (additive and Shamir) require modular arithmetic over a finite field. The field size determines:

1. **Security**: Smaller fields are vulnerable to brute-force enumeration
2. **Performance**: Larger fields require bigint operations
3. **Compatibility**: JavaScript `number` has safe integer limits

## Decision

We provide two configurations:

### Demo Mode (Default)

Uses Mersenne prime `2^31 - 1 = 2,147,483,647`:

```typescript
export const SHAMIR_PRIME = 2 ** 31 - 1;
```

**Rationale**:

- Fits in JavaScript safe integer range
- Simple arithmetic without bigint overhead
- Sufficient for demonstrating MPC concepts
- **NOT secure for production** (enumerable in seconds)

### Production Mode (Future)

Should use 256-bit prime (e.g., secp256k1 field order):

```typescript
export const PRODUCTION_PRIME = 2n ** 256n - 2n ** 32n - 977n;
```

**Rationale**:

- 128+ bits of security against enumeration
- Matches industry standards for secret sharing
- Requires bigint arithmetic

## Current Implementation

The current implementation uses demo mode:

```typescript
// modules/mpc/src/crypto.ts
export const SHAMIR_PRIME = 2 ** 31 - 1;
```

A `skills/` warning documents this limitation:

> "Field size < 2^128 allows brute-force enumeration. Current implementation uses 2^31-1 for demo; production needs 256-bit prime."

## Consequences

### Positive

- Demo mode is fast and easy to understand
- Clear documentation of security limitations
- Path to production mode is defined

### Negative

- Developers might deploy demo mode to production
- Two code paths to maintain once production mode added
- Bigint arithmetic is slower

## Migration Path

1. Add `MPC_FIELD_SIZE` environment variable
2. Implement `bigint-crypto.ts` with 256-bit operations
3. Default to demo mode for backward compatibility
4. Require explicit opt-in for production mode

## References

- `skills/mpc-secret-sharing.md:122-123` - Field size warning
- `modules/mpc/src/crypto.ts` - Current implementation
- Issue #60 - Production field arithmetic upgrade
