# Skill: HSM Key Management Patterns

## When to use

When blockchain transactions or audit proofs require hardware-backed signing, envelope encryption for sensitive data at rest, or multi-custodian key ceremonies.

## Key concepts

- **HsmClient**: Facade over asymmetric key, symmetric key, and envelope encryption services. Must call `initialize({ slotId, label })` before use.
- **Asymmetric signing**: EC P-256 key generation + ECDSA-SHA256 signing. Used for transaction signing and audit proof commitments.
- **Envelope encryption**: DEK (data encryption key) encrypted under a KEK (key encryption key) stored in the HSM. The HSM never exposes the KEK.
- **Key ceremony**: Combines HSM root key generation with Shamir threshold sharing (e.g., 3-of-5 custodians) so no single person holds the full key.

## Implementation pattern

```
HsmClient
  ├── generateKeyPair(label) → { publicKey, privateKey }
  ├── sign(label, data)      → { signature, algorithm, keyLabel }
  ├── verify(label, data, signature) → boolean
  ├── exportPublicKey(label) → hex string
  ├── generateSymmetricKey(label)
  ├── wrapKey(dek, kekLabel) → WrappedKey
  ├── unwrapKey(wrapped)     → Buffer
  ├── encryptWithEnvelope(kekLabel, plaintext) → { wrappedDek, encryptedRecord }
  └── decryptWithEnvelope(wrappedDek, encryptedRecord) → plaintext
```

All operations are recorded in an `AuditLog` for compliance.

## Pitfalls

- Never store private key material as plain strings in production — the in-memory implementations are for demonstration only.
- Always call `initialize()` before any other method; the client throws if uninitialized.
- The HSM client is not thread-safe — in concurrent environments, use one instance per goroutine/worker or serialize access.

## References

- `modules/hsm/src/index.ts`
- `examples/hsm-transaction-signing/index.ts`
- `examples/hsm-key-ceremony/index.ts`
- `examples/hsm-envelope-encryption/index.ts`
- `docs/architecture/hsm-integration-patterns.md`
