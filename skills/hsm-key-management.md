# HSM Key Management

Hardware security module patterns for blockchain transaction signing and data encryption.

## When to Use

- Transaction signing requiring hardware-backed private keys
- Envelope encryption for sensitive data at rest
- Multi-custodian key ceremonies with threshold recovery
- Audit-compliant cryptographic operations

## When NOT to Use

- Development/testing environments (use in-memory simulation)
- Public key distribution (HSM stores private keys only)
- Symmetric-only encryption without key hierarchy

## Key Concepts

**HSM Boundary**: Private keys never leave HSM hardware. All cryptographic operations execute inside the secure enclave. Only public keys and ciphertexts cross the boundary.

**Envelope Encryption**: Two-tier key hierarchy. DEK (Data Encryption Key) encrypts payload. KEK (Key Encryption Key) wraps DEK. HSM holds KEK; wrapped DEK stored alongside ciphertext.

**Key Ceremony**: Multi-party initialization combining HSM root key generation with Shamir threshold sharing. Requires k-of-n custodians to reconstruct. No single custodian holds complete key material.

**Audit Log**: Immutable record of all HSM operations. Each entry includes operation type, key label, timestamp, and result status.

## Architecture

```
Application Layer (modules/hsm/src/application/)
├── asymmetric-key-service.ts  → Sign, verify, export public key
├── symmetric-key-service.ts   → Wrap, unwrap DEK
└── envelope-encryption-service.ts → Encrypt/decrypt with envelope

Domain Layer (modules/hsm/src/domain/)
├── entities.ts  → HsmSlotConfig, HsmKeyPair, HsmSignatureResult, WrappedKey,
│                  EncryptedRecord, EnvelopeEncryptionResult, HsmAuditEntry
└── ports.ts     → KeyStore, AuditLog interfaces

Infrastructure Layer (modules/hsm/src/infrastructure/)
├── key-store.ts  → InMemoryKeyStore (simulation)
└── audit-log.ts  → InMemoryAuditLog
```

**Interface Segregation**: Separate services for asymmetric operations, symmetric operations, and envelope encryption. Clients depend only on required capabilities.

**Dependency Inversion**: `HsmClient` facade composes services. Services depend on `KeyStore` and `AuditLog` ports, not implementations.

## Implementation

```typescript
HsmClient
├── initialize(config: HsmSlotConfig)  // { slotId: string; label: string }
├── generateKeyPair(label: string): HsmKeyPair
├── sign(label: string, data: string): HsmSignatureResult
├── verify(label: string, data: string, signature: string): boolean
├── exportPublicKey(label: string): string
├── generateSymmetricKey(label: string): void
├── wrapKey(plaintextDek: Buffer, kekLabel: string): WrappedKey
├── unwrapKey(wrapped: WrappedKey): Buffer
├── encryptWithEnvelope(kekLabel: string, plaintext: string): EnvelopeEncryptionResult
├── decryptWithEnvelope(wrappedDek: WrappedKey, encryptedRecord: EncryptedRecord): string
└── getAuditLog(): readonly HsmAuditEntry[]

HsmSlotConfig {
  slotId: string
  label: string
}

HsmKeyPair {
  label: string
  publicKey: string
  algorithm: 'EC_P256'
}

HsmSignatureResult {
  signature: string
  algorithm: 'ECDSA_SHA256'
}

WrappedKey {
  wrappedDek: string
  kekLabel: string
  algorithm: 'AES_256_WRAP'
}

EnvelopeEncryptionResult {
  wrappedDek: WrappedKey
  encryptedRecord: EncryptedRecord
}

EncryptedRecord {
  ciphertext: string
  iv: string
  algorithm: 'AES_256_GCM'
}

HsmAuditEntry {
  operation: string
  keyLabel: string
  timestamp: number
  status: 'success' | 'failure'
}
```

## Security Constraints

| Constraint              | Rationale                                          |
| ----------------------- | -------------------------------------------------- |
| No private key export   | Keys bound to HSM hardware                         |
| Label uniqueness        | Prevents key collision attacks                     |
| Algorithm pinning       | EC P-256 for asymmetric, AES-256-GCM for symmetric |
| Audit on all operations | Compliance and forensics                           |

## Must-Preserve Invariants

1. **Initialization required**: All operations throw if `initialize()` not called
2. **Immutable audit**: `getAuditLog()` returns readonly snapshot; callers cannot modify
3. **Label uniqueness**: `generateKeyPair()` throws on duplicate label
4. **Round-trip verification**: `verify(label, data, sign(label, data).signature) === true`
5. **Envelope binding**: `WrappedKey.kekLabel` must match KEK used for unwrapping

## Anti-patterns

**Storing key material as strings**: In-memory implementations use `Buffer` for key bytes. Production HSMs return opaque handles. Never serialize private keys to strings.

**Skipping initialization**: HSM slot binding is security-critical. Uninitialized client throws to prevent accidental plaintext operations.

**Shared HSM instance across threads**: `HsmClient` is not thread-safe. Use one instance per worker or serialize access with mutex.

**Reusing labels across key types**: Label `payment-key` for both asymmetric and symmetric keys causes type confusion. Use distinct naming: `payment-signer`, `payment-kek`.

**Ignoring audit log**: Audit entries are compliance artifacts. Export and archive before log rotation.

**Hardcoding slot configuration**: Load `HsmSlotConfig` from environment or secure config. Never commit slot IDs.

## Related Skills

- [mpc-secret-sharing](mpc-secret-sharing.md) — Threshold key distribution for ceremonies
- [post-quantum-crypto](post-quantum-crypto.md) — Hybrid schemes combining HSM with PQ algorithms
- [selective-disclosure](selective-disclosure.md) — HSM-signed audit proofs

## References

- `modules/hsm/src/index.ts`
- `modules/hsm/src/domain/entities.ts`
- `modules/hsm/src/domain/ports.ts`
- `modules/hsm/src/application/asymmetric-key-service.ts`
- `modules/hsm/src/application/symmetric-key-service.ts`
- `modules/hsm/src/application/envelope-encryption-service.ts`
- `examples/hsm-transaction-signing/index.ts`
- `examples/hsm-key-ceremony/index.ts`
- `examples/hsm-envelope-encryption/index.ts`
- `examples/hsm-real-pkcs11/index.ts`
- `docs/architecture/hsm-integration-patterns.md`
