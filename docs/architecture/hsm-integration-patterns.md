# HSM Integration Patterns

How the `HsmClient` software simulation maps to real Hardware Security Module deployments, and where HSM-protected keys fit the repository's blockchain integration layers.

## Position in the architecture

```
Case Study Scenarios
  └─ hsm-transaction-signing, hsm-key-ceremony, hsm-envelope-encryption, hsm-real-pkcs11
Domain Module
  └─ modules/hsm   (HsmClient)
Shared Utilities
  └─ modules/shared/src/crypto   (sha256hex — attestation digest)
Integration Clients
  └─ Fabric gateway: HSM key signs endorsement proposals
  └─ Besu client:   HSM key signs raw EVM transactions (ethers Signer)
  └─ Corda gateway: HSM key backs the legal-identity certificate
```

The HSM layer is **off-ledger key custody**: the private key never appears on the distributed ledger. Only the resulting signatures, public-key fingerprints, and wrapped DEKs are written to chain.

## Key concepts

### Opaque key handle

Every private key is assigned an opaque string handle (`hsm:<slotId>:<label>:<rand16hex>`). The handle is the only artifact returned to callers — it encodes enough metadata to route future operations to the correct HSM slot but contains no key material. This mirrors the `CKObjectHandle` pattern in PKCS#11.

### HSM attestation digest

Each sign operation appends a `hsmAttestation` field to the result:

```
sha256( slotId : keyLabel : timestamp : signatureHex )
```

Counterparties can verify:

1. Signature validity — verifying ECDSA against the published PEM public key.
2. HSM origin — checking the attestation digest against the known `slotId` and the signed `timestamp`.

In production a real HSM attestation is a hardware-signed certificate chain from the device manufacturer. The digest here provides the same _shape_ for educational purposes.

### Envelope encryption (DEK / KEK)

| Layer                     | Key               | Lives where                      | Operation                  |
| ------------------------- | ----------------- | -------------------------------- | -------------------------- |
| KEK (Key Encryption Key)  | AES-256           | HSM keystore only                | Wraps / unwraps the DEK    |
| DEK (Data Encryption Key) | AES-256 ephemeral | In-memory only, zeroed after use | Encrypts the payload       |
| Ciphertext                | —                 | On-ledger record                 | Useless without HSM access |

The on-ledger record contains only `encryptedRecord` (ciphertext) and `wrappedDek` (encrypted DEK). Without the HSM holding the matching KEK, neither can be decrypted. The `dek` buffer is zeroed (`dek.fill(0)`) immediately after wrapping to limit its lifetime in the JS heap.

This pattern is the software equivalent of `CKM_AES_KEY_WRAP` (PKCS#11) or `kms:GenerateDataKey` (AWS KMS).

## PKCS#11 operation mapping

| `HsmClient` method     | PKCS#11 mechanism                           | Production provider examples                     |
| ---------------------- | ------------------------------------------- | ------------------------------------------------ |
| `generateKeyPair`      | `C_GenerateKeyPair` + `CKM_EC_KEY_PAIR_GEN` | Thales Luna ≥ 7, AWS CloudHSM, Azure Managed HSM |
| `sign`                 | `C_Sign` + `CKM_ECDSA` + SHA-256 pre-hash   | Same                                             |
| `verify`               | `C_Verify` + `CKM_ECDSA`                    | Same                                             |
| `generateSymmetricKey` | `C_GenerateKey` + `CKM_AES_KEY_GEN`         | Same                                             |
| `wrapKey`              | `C_WrapKey` + `CKM_AES_GCM`                 | Same                                             |
| `unwrapKey`            | `C_UnwrapKey` + `CKM_AES_GCM`               | Same                                             |

Production deployments use a PKCS#11 driver (e.g. `graphene-pk11` npm package) rather than `node:crypto`. The `HsmClient` facade and underlying services support both sync and async APIs — use `*Async()` methods for hardware HSM operations. See `examples/hsm-real-pkcs11` for a working implementation with SoftHSM2.

## Blockchain integration patterns

### Hyperledger Fabric — endorsement signing

A Fabric client signs proposal bytes with the organization's private key before submitting to peers. With an HSM-backed key:

```
Gateway.connect(grpcClient, { identity, signer: hsmSignerAdapter })
```

The `signer` function calls `hsm.sign(keyLabel, proposalBytes)` and returns the DER signature. The HSM key label maps to the MSP identity certificate registered in the channel configuration.

Key rotation is a Fabric MSP update: the new PEM public key is submitted to the channel's MSP config, and the HSM slot is updated. The opaque handle changes; the MSP identity certificate changes; the ledger history remains intact.

### Besu — EVM transaction signing

`ethers.js` accepts a custom `Signer` implementation. An HSM-backed Signer overrides `signTransaction` to route the ECDSA signing step through `hsm.sign(keyLabel, txHash)`. The resulting signature is used to construct the `v/r/s` fields of the raw transaction.

```
class HsmSigner extends ethers.AbstractSigner {
  signTransaction(tx): Promise<string> {
    const { signature } = hsm.sign(this.keyLabel, txHash);
    return encodeSignedTx(tx, signature);
  }
}
```

Note: Besu ECDSA uses the `secp256k1` curve, not `P-256`. A production HSM integration targets `CKM_ECDSA` with a `secp256k1` named-curve key object. The demo uses `P-256` as a structural illustration.

### Corda — legal identity certificate

Corda nodes hold a legal-identity key pair registered with the Network Map Service. HSM integration uses the Corda HSM configuration (`cryptoService` in `node.conf`) to delegate signing to a PKCS#11 library. The `HsmClient` maps to this role: the generated public key PEM is submitted as the legal-identity certificate subject key, and the HSM handles all signing requests for that identity.

## Initialization and slot lifecycle

```
1. hsm.initialize({ slotId, label })  — bind to a named slot
2. hsm.generateKeyPair(label)         — provision key; returns opaque handle
3. hsm.sign(label, payload)           — sign with stored private key
4.  ...
5. (hsm instance goes out of scope)   — symmetric key buffers freed by GC
```

`initialize()` enforces:

- Non-empty `slotId` and `label`.
- Single initialization per instance — call `new HsmClient()` for each slot.

The `getAuditLog()` method is the only operation safe to call before `initialize()` (it returns an empty array).

## Audit Log Adapters

The HSM module supports multiple audit log backends for compliance requirements:

### In-Memory (default)

```typescript
import { InMemoryAuditLog } from "@enterprise-blockchain/hsm";
const audit = new InMemoryAuditLog();
```

Suitable for development and testing. Lost on process restart.

### File-based with cryptographic chaining

```typescript
import { FileAuditLog } from "@enterprise-blockchain/hsm";
const audit = new FileAuditLog("/var/log/hsm-audit.ndjson");

// Verify integrity of the audit chain
const { valid, errors } = audit.verifyIntegrity();
```

Each entry includes:

- SHA-256 hash of the previous entry (tamper-evidence)
- Monotonic sequence number (gap detection)
- Entry hash for integrity verification

File format: NDJSON (newline-delimited JSON) for append-only writes.

### Syslog for enterprise SIEM

```typescript
import { SyslogAuditLog } from "@enterprise-blockchain/hsm";
const audit = new SyslogAuditLog({
  host: "siem.corp.example.com",
  port: 514,
  facility: "auth",
  appName: "hsm-audit",
});
```

Sends RFC 5424 formatted messages to a syslog server. Includes structured data with operation details and entry hash for correlation.

### Factory with environment configuration

```typescript
import { AuditLogFactory } from "@enterprise-blockchain/hsm";

// Reads HSM_AUDIT_LOG_TYPE, HSM_AUDIT_LOG_PATH, HSM_SYSLOG_* from env
const audit = AuditLogFactory.createFromEnv();
```

Environment variables:

| Variable              | Values                     | Description          |
| --------------------- | -------------------------- | -------------------- |
| `HSM_AUDIT_LOG_TYPE`  | `memory`, `file`, `syslog` | Adapter type         |
| `HSM_AUDIT_LOG_PATH`  | File path                  | For `file` type      |
| `HSM_SYSLOG_HOST`     | Hostname or IP             | Syslog server        |
| `HSM_SYSLOG_PORT`     | Port number                | Default: 514         |
| `HSM_SYSLOG_FACILITY` | RFC 5424 facility name     | Default: `auth`      |
| `HSM_SYSLOG_APP_NAME` | Application identifier     | Default: `hsm-audit` |

## When to use HSM vs. other key storage patterns

| Pattern                 | Mechanism                                    | Best for                                                                      |
| ----------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| **HSM**                 | Hardware-isolated key operations             | Production signing keys, regulatory mandates (PCI-DSS, ISO 27001, FIPS 140-2) |
| **KMS** (AWS/Azure/GCP) | Cloud-hosted key management with HSM backing | Cloud-native deployments                                                      |
| **Secret manager**      | Encrypted key material stored outside code   | Non-signing secrets (API keys, bearer tokens)                                 |
| **In-memory key**       | `node:crypto` `KeyObject` in process         | Development, testing, or ephemeral keys                                       |

Use HSM-backed keys whenever:

- A private key signs **financial transactions** or **legal identities**.
- Compliance requires demonstrable proof that key material is hardware-protected.
- The threat model includes a compromised application server.

## Reading path

1. Start with [modules/hsm/src/index.ts](../../modules/hsm/src/index.ts) — `HsmClient` implementation and interface definitions.
2. Read [examples/hsm-transaction-signing/index.ts](../../examples/hsm-transaction-signing/index.ts) — ECDSA signing for a trade order.
3. Read [examples/hsm-key-ceremony/index.ts](../../examples/hsm-key-ceremony/index.ts) — HSM + Shamir secret sharing combined for a consortium onboarding ceremony.
4. Read [examples/hsm-envelope-encryption/index.ts](../../examples/hsm-envelope-encryption/index.ts) — DEK/KEK envelope encryption for on-ledger document confidentiality.
5. Read [examples/hsm-real-pkcs11/index.ts](../../examples/hsm-real-pkcs11/index.ts) — Real PKCS#11 integration via `graphene-pk11` with SoftHSM2 and multi-algorithm support.
6. Cross-reference [architecture/mpc-quantum-resistance.md](./mpc-quantum-resistance.md) for the off-chain cryptographic counterpart (MPC, Shamir SSS, hash-ladder quantum resistance).
