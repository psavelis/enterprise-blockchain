# HSM Envelope Encryption

TradeFin platform protects Bills of Lading and commercial invoices stored on a
consortium ledger. Each document is encrypted with an ephemeral DEK; the DEK
is AES-256-GCM wrapped by a KEK that never leaves the TradeFin HSM slot.
Third parties with different HSM instances cannot unwrap the DEK.

## What it demonstrates

- AES-256-GCM symmetric KEK generation on a named HSM slot (key never returned).
- Envelope encryption: ephemeral DEK encrypts payload; HSM wraps DEK.
- On-ledger record format: ciphertext + wrapped DEK — safe for consortium storage.
- Authorised decryption: same HSM slot unwraps DEK and recovers plaintext.
- Unauthorised access: wrong KEK causes GCM authentication failure before any plaintext is produced.
- TradeFin KMS HSM append-only audit log covering all wrap/encrypt operations.

## Run

```
npm run example:hsm-envelope-encryption
```
