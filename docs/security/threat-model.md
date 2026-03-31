# Threat Model: Security-Critical Modules

This document describes the threat model for the HSM, MPC, and post-quantum cryptography modules. It identifies trust boundaries, analyzes attack surfaces using STRIDE, and documents security assumptions.

## 1. Trust Boundaries

### 1.1 HSM Module Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    HsmClient Facade                      │    │
│  │  - initialize()     - sign()         - wrapKey()        │    │
│  │  - generateKeyPair() - verify()      - unwrapKey()      │    │
│  │  - exportPublicKey() - encryptWithEnvelope()            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   HSM Boundary (Trust)                   │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ Asymmetric  │  │ Symmetric   │  │ Envelope        │  │    │
│  │  │ KeyService  │  │ KeyService  │  │ EncryptionSvc   │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  │                              │                           │    │
│  │                              ▼                           │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │              KeyStore (In-Memory)                │    │    │
│  │  │  - Private keys NEVER cross this boundary       │    │    │
│  │  │  - Only opaque handles returned                 │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    AuditLog (Immutable)                  │    │
│  │  - Records all operations                               │    │
│  │  - Readonly snapshots only                              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**What crosses the boundary:**

- Public keys (PEM format)
- Ciphertexts and signatures
- Wrapped DEKs (encrypted)
- Audit log entries

**What NEVER crosses:**

- Private key material
- Unwrapped symmetric keys
- Key generation seeds

### 1.2 MPC Module Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                        MPC Coordinator                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      MPCEngine                           │    │
│  │  - registerParty()   - splitSecret()                    │    │
│  │  - submitShare()     - compute()                        │    │
│  │  - verifyIntegrity()                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │   Party A     │  │   Party B     │  │   Party C     │       │
│  │ (Trust Zone)  │  │ (Trust Zone)  │  │ (Trust Zone)  │       │
│  │               │  │               │  │               │       │
│  │ - Holds share │  │ - Holds share │  │ - Holds share │       │
│  │ - Commitment  │  │ - Commitment  │  │ - Commitment  │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Computation Result                      │    │
│  │  - Aggregate value (sum) OR boolean (threshold)         │    │
│  │  - Integrity proof (SHA-256)                            │    │
│  │  - Individual shares NOT revealed                       │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Trust assumptions:**

- Honest majority: At least k parties are honest in k-of-n threshold
- Secure channels: Shares transmitted over authenticated channels
- Commitment binding: Parties commit before reveal

### 1.3 Protocol Adapter Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                       Domain Layer                               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            Domain Services (RecallAssessor, etc.)        │    │
│  │  - NO protocol knowledge                                │    │
│  │  - Depends on Repository ports only                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Protocol Ports                          │    │
│  │  (IBesuTransactionPort, FabricChaincodePort, etc.)      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
├──────────────────────────────┼──────────────────────────────────┤
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Protocol Adapters (Stateless)               │    │
│  │  - Pure transformation functions                        │    │
│  │  - No I/O, no SDK imports                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            Integration Clients (Stateful)                │    │
│  │  - SDK wrappers (ethers, fabric-gateway, etc.)          │    │
│  │  - Retry, circuit breaker, error mapping                │    │
│  │  - Network I/O crosses trust boundary here              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 2. STRIDE Analysis

### 2.1 HSM Module

| Threat              | Component      | Risk                         | Mitigation                                           | Status    |
| ------------------- | -------------- | ---------------------------- | ---------------------------------------------------- | --------- |
| **Spoofing**        | HsmClient      | Unauthorized key operations  | `initialize()` required; throws if not called        | Mitigated |
| **Tampering**       | KeyStore       | Key material modification    | In-memory only; no serialization of private keys     | Mitigated |
| **Repudiation**     | Operations     | Denying cryptographic action | Immutable AuditLog records all operations            | Mitigated |
| **Info Disclosure** | Private keys   | Key extraction               | Keys never exported; only public keys cross boundary | Mitigated |
| **DoS**             | Key generation | Resource exhaustion          | No rate limiting on key generation                   | **Gap**   |
| **Elevation**       | Key labels     | Type confusion attack        | Separate key types; validation on use                | Mitigated |

### 2.2 MPC Module

| Threat              | Component        | Risk                           | Mitigation                                           | Status    |
| ------------------- | ---------------- | ------------------------------ | ---------------------------------------------------- | --------- |
| **Spoofing**        | Party identity   | Impersonating party            | `registerParty()` with endpoint verification         | Partial   |
| **Tampering**       | Share values     | Biasing computation            | Commitment verification before aggregation           | Mitigated |
| **Repudiation**     | Share submission | Denying participation          | IntegrityProof binds shares to result                | Mitigated |
| **Info Disclosure** | Secret value     | Leaking input                  | Information-theoretic security (k-1 reveals nothing) | Mitigated |
| **DoS**             | Compute sessions | Memory exhaustion              | No session quota or TTL                              | **Gap**   |
| **Elevation**       | Threshold bypass | Reconstructing with < k shares | Explicit threshold check; returns null               | Mitigated |

### 2.3 Post-Quantum Crypto (Kyber/ML-KEM)

| Threat              | Component      | Risk                       | Mitigation                                           | Status    |
| ------------------- | -------------- | -------------------------- | ---------------------------------------------------- | --------- |
| **Spoofing**        | Key pairs      | Accepting wrong public key | Application responsibility (key pinning)             | Partial   |
| **Tampering**       | Ciphertext     | Modified encapsulation     | Implicit rejection (wrong key → random secret)       | Mitigated |
| **Repudiation**     | Key exchange   | Denying participation      | Audit commitments (SHA-256 of ciphertext)            | Mitigated |
| **Info Disclosure** | Shared secret  | Quantum attack             | ML-KEM-768 (NIST Level 3); Hybrid KEM for transition | Mitigated |
| **DoS**             | Key generation | Expensive PQ operations    | Inherent cost; document performance profile          | Partial   |
| **Elevation**       | Parameter sets | Using weak parameters      | Only ml-kem-512/768/1024 supported                   | Mitigated |

### 2.4 Integration Clients

| Threat              | Component      | Risk                         | Mitigation                                    | Status    |
| ------------------- | -------------- | ---------------------------- | --------------------------------------------- | --------- |
| **Spoofing**        | RPC endpoint   | Connecting to malicious node | HTTPS required; application validates chainId | Partial   |
| **Tampering**       | Transaction    | Man-in-the-middle            | Signed transactions; TLS for transport        | Mitigated |
| **Repudiation**     | Submission     | Denying transaction          | On-chain receipt; hash returned               | Mitigated |
| **Info Disclosure** | Private key    | Key in memory                | NonceManager wraps Wallet; key not logged     | Partial   |
| **DoS**             | Network        | Endpoint unavailable         | Circuit breaker + retry with backoff          | Mitigated |
| **Elevation**       | Gas estimation | Insufficient funds bypass    | Explicit INSUFFICIENT_FUNDS error mapping     | Mitigated |

## 3. Attack Trees

### 3.1 Key Extraction from HSM

```
Goal: Extract private key material from HsmClient
│
├─ [AND] Access KeyStore directly
│   ├─ [BLOCKED] KeyStore is private field
│   ├─ [BLOCKED] No serialization method
│   └─ [BLOCKED] No key export API
│
├─ [AND] Intercept signing operation
│   ├─ [BLOCKED] Sign returns signature only, not key
│   └─ [BLOCKED] Node.js crypto operates in memory
│
├─ [OR] Memory dump attack
│   ├─ [PARTIAL] Process memory contains keys
│   ├─ [MITIGATION] Production HSM uses hardware enclave
│   └─ [MITIGATION] Key zeroization on unwrap (envelope)
│
└─ [OR] Timing side-channel
    ├─ [PARTIAL] ECDSA signing is variable-time
    └─ [MITIGATION] Non-interactive verification (no oracle)
```

### 3.2 Biasing MPC Computation

```
Goal: Manipulate aggregate result without detection
│
├─ [AND] Submit false share value
│   ├─ [BLOCKED] Commitment verification rejects mismatched value
│   └─ [BLOCKED] SHA-256(partyId || index || value || nonce) binding
│
├─ [AND] Replay previous share
│   ├─ [BLOCKED] computationId must be fresh per session
│   └─ [BLOCKED] Duplicate submission rejected per party
│
├─ [OR] Collude with k-1 parties
│   ├─ [PARTIAL] Information-theoretic security assumes honest majority
│   └─ [MITIGATION] Use k > n/2 threshold
│
└─ [OR] DoS to exclude honest parties
    ├─ [GAP] No session timeout mechanism
    └─ [GAP] No rate limiting on submission
```

### 3.3 Forging Recall Assessments

```
Goal: Create false recall assessment to disrupt supply chain
│
├─ [AND] Manipulate telemetry readings
│   ├─ [PARTIAL] Telemetry stored via TraceabilityWriter port
│   ├─ [MITIGATION] On-chain anchoring provides tamper evidence
│   └─ [MITIGATION] Cross-chain oracle verification (TraceabilityAnchor.sol)
│
├─ [AND] Bypass temperature thresholds
│   ├─ [BLOCKED] RecallAssessor uses domain-defined thresholds
│   └─ [BLOCKED] Thresholds in code, not configuration
│
├─ [OR] Inject false supplier data
│   ├─ [PARTIAL] Supplier registered via domain service
│   └─ [MITIGATION] Multi-sig oracle for cross-chain verification
│
└─ [OR] Sign recall notice with wrong key
    ├─ [BLOCKED] HSM-signed notices include key label in audit
    └─ [MITIGATION] Public key pinning for known authorities
```

## 4. Security Assumptions

### 4.1 Cryptographic Assumptions

| Assumption                           | Basis                         | Confidence |
| ------------------------------------ | ----------------------------- | ---------- |
| ECDSA (P-256) is secure              | 128-bit classical security    | High       |
| AES-256-GCM is secure                | 256-bit symmetric security    | High       |
| SHA-256 is collision-resistant       | 128-bit collision resistance  | High       |
| ML-KEM-768 is quantum-resistant      | NIST FIPS 203 standardization | High       |
| ML-DSA-65 is quantum-resistant       | NIST FIPS 204 standardization | High       |
| Hybrid KEM provides defense-in-depth | Both channels must be broken  | High       |

### 4.2 Operational Assumptions

| Assumption                             | Risk if Violated             | Mitigation                                 |
| -------------------------------------- | ---------------------------- | ------------------------------------------ |
| HSM process memory is protected        | Key extraction via dump      | Use hardware HSM in production             |
| MPC parties have honest majority (k-1) | Collusion can bias result    | Use k > n/2; audit participation           |
| Network adversary is passive           | Active MitM can delay/drop   | TLS for transport; timeout handling        |
| Blockchain nodes are honest majority   | Forged transactions accepted | Use permissioned networks; verify receipts |
| System clock is synchronized           | Replay attacks on timestamps | NTP; audit log ordering                    |

### 4.3 Trust Model Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                         TRUST LEVELS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FULLY TRUSTED:                                                  │
│  - HSM boundary (private key operations)                        │
│  - Field arithmetic correctness                                 │
│  - NIST-standardized algorithms                                 │
│                                                                  │
│  CONDITIONALLY TRUSTED:                                          │
│  - MPC parties (honest majority assumption)                     │
│  - Blockchain network (permissioned, known validators)          │
│  - Integration endpoints (authenticated, TLS)                   │
│                                                                  │
│  UNTRUSTED:                                                      │
│  - External inputs (validate all user data)                     │
│  - Network transport (assume eavesdropping possible)            │
│  - Client applications (enforce authentication)                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Recommendations

### 5.1 Immediate (Address Gaps)

1. **MPC Rate Limiting** (#75): Add ResourceQuotaManager to prevent DoS via session exhaustion
2. **Session TTL**: Add expiration for incomplete MPC sessions
3. **Health Checks**: Implemented in this release for integration clients

### 5.2 Short-Term

4. **Hardware HSM Integration**: Document path to Thales Luna / AWS CloudHSM
5. **Constant-Time Field Arithmetic**: Replace BigInt operations with constant-time library
6. **Audit Log Persistence**: Add PostgreSQL adapter for compliance retention

### 5.3 Long-Term

7. **Formal Verification**: Apply Certora/Halmos to AidSettlement.sol
8. **Key Rotation**: Implement automated key rotation with overlap period
9. **Incident Response Playbook**: Document breach response procedures

## References

- [NIST FIPS 203 (ML-KEM)](https://csrc.nist.gov/pubs/fips/203/final)
- [NIST FIPS 204 (ML-DSA)](https://csrc.nist.gov/pubs/fips/204/final)
- [NIST SP 800-57 Part 1 (Key Management)](https://csrc.nist.gov/publications/detail/sp/800-57-part-1/rev-5/final)
- [PKCS#11 v3.1](https://docs.oasis-open.org/pkcs11/pkcs11-curr/v3.1/pkcs11-curr-v3.1.html)
- [RFC 5869 (HKDF)](https://datatracker.ietf.org/doc/html/rfc5869)
