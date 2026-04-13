# @psavelis/enterprise-blockchain

Production-grade TypeScript modules for recursive STARK settlement, post-quantum cryptography (ML-KEM/ML-DSA), MPC, HSM, and multi-rail (Solana + Bitcoin + fiat) infrastructure.

[![npm version](https://img.shields.io/npm/v/@psavelis/enterprise-blockchain)](https://www.npmjs.com/package/@psavelis/enterprise-blockchain)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](../../LICENSE)

## Install in 10 Seconds

```bash
npm install @psavelis/enterprise-blockchain
```

```typescript
import { KyberKem } from "@psavelis/enterprise-blockchain/mpc";

// Post-quantum key exchange (NIST FIPS 203)
const kem = new KyberKem();
const { publicKey, secretKey } = kem.generateKeyPair("ml-kem-768");
const { ciphertext, sharedSecret } = kem.encapsulate(publicKey, "ml-kem-768");
const decrypted = kem.decapsulate(ciphertext, secretKey, "ml-kem-768");
// sharedSecret === decrypted ✓
```

---

## Quick Start

### Post-Quantum Key Exchange (ML-KEM-768)

```typescript
import { KyberKem } from "@psavelis/enterprise-blockchain/mpc";

const kem = new KyberKem();
const params = "ml-kem-768";
const { publicKey, secretKey } = kem.generateKeyPair(params);
const { ciphertext, sharedSecret } = kem.encapsulate(publicKey, params);
const decapsulated = kem.decapsulate(ciphertext, secretKey, params);
```

### Post-Quantum Signatures (ML-DSA-65)

```typescript
import { MlDsaSigner } from "@psavelis/enterprise-blockchain/mpc";

const signer = new MlDsaSigner();
const { publicKey, secretKey } = signer.generateKeyPair("ml-dsa-65");
const { signature } = signer.sign(message, secretKey, "ml-dsa-65");
const valid = signer.verify(message, signature, publicKey, "ml-dsa-65");
```

### STARK Settlement

```typescript
import {
  createDefaultContext,
  LedgerService,
  AggregatorService,
  SettlementService,
} from "@psavelis/enterprise-blockchain/stark-settlement";

const ctx = createDefaultContext();
const ledger = new LedgerService(ctx);
const aggregator = new AggregatorService(ctx);
const settler = new SettlementService(ctx);

// Create accounts, submit transactions, aggregate proofs, settle
```

### HSM Key Management

```typescript
import { HsmClient } from "@psavelis/enterprise-blockchain/hsm";

const hsm = new HsmClient();
hsm.initialize({ slotId: "slot-1", label: "my-hsm" });
const { keyLabel } = hsm.generateKeyPair("my-signing-key");
const signResult = hsm.sign(keyLabel, message);
const valid = hsm.verify(keyLabel, message, signResult.signature);
```

### Pay-to-Merkle-Root (Quantum-Safe Bitcoin)

```typescript
import {
  createP2MROutput,
  createSingleSigLeaf,
  createTimelockLeaf,
  MerkleTree,
} from "@psavelis/enterprise-blockchain/p2mr";

const { output, tree } = createP2MROutput({
  leaves: [
    createSingleSigLeaf(primaryKeyHash),
    createTimelockLeaf(backupKeyHash, futureTimestamp),
  ],
  value: 100_000_000n,
});
```

## Subpath Exports

| Import Path                                            | Description                                           |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `@psavelis/enterprise-blockchain/mpc`                  | MPC engine, ML-KEM, ML-DSA, Hybrid KEM, Shamir SSS    |
| `@psavelis/enterprise-blockchain/hsm`                  | PKCS#11 HSM simulator, envelope encryption            |
| `@psavelis/enterprise-blockchain/p2mr`                 | Pay-to-Merkle-Root quantum-safe Bitcoin outputs       |
| `@psavelis/enterprise-blockchain/stark-settlement`     | 3-tier STARK proof aggregation, multi-rail settlement |
| `@psavelis/enterprise-blockchain/credentialing`        | Clinical credential verification                      |
| `@psavelis/enterprise-blockchain/privacy`              | Selective disclosure ledger                           |
| `@psavelis/enterprise-blockchain/traceability`         | Supply-chain traceability                             |
| `@psavelis/enterprise-blockchain/aid-settlement`       | Aid voucher reconciliation                            |
| `@psavelis/enterprise-blockchain/protocols`            | Fabric/Besu/Corda adapter interfaces                  |
| `@psavelis/enterprise-blockchain/integrations`         | SDK clients with circuit breaker patterns             |
| `@psavelis/enterprise-blockchain/shared`               | Utilities, crypto, stores (no telemetry re-export)    |
| `@psavelis/enterprise-blockchain/shared/telemetry`     | createTracer, createMeter, withSpan helpers           |
| `@psavelis/enterprise-blockchain/shared/telemetry-sdk` | OpenTelemetry SDK initialization (side-effect import) |

## Architecture

Strict hexagonal architecture with clean domain/ports/adapters separation. Domain layers never import SDK code.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application Services                          │
│  LedgerService │ AggregatorService │ SettlementService           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                     Domain Ports                                  │
│  StarkProofGeneratorPort │ LedgerPersistencePort │ SettlementPorts│
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────────┐
│                 Infrastructure Adapters                           │
│  StoneProofAdapter │ MockStarkAdapter │ SolanaAdapter │ BitcoinAdapter │
└─────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Post-Quantum Cryptography**: NIST FIPS 203 ML-KEM, FIPS 204 ML-DSA
- **Hybrid KEM**: X25519 + ML-KEM-768 for defense-in-depth
- **STARK Proofs**: 3-tier recursive aggregation (8,192 transactions per block)
- **Multi-Rail Settlement**: Solana, Bitcoin (PSBT), Fiat (ISO 20022)
- **HSM Integration**: PKCS#11-style key management with audit logging
- **Protocol Adapters**: Fabric, Besu, Corda with circuit breakers
- **OpenTelemetry**: Built-in observability with tracing and metrics

## Peer Dependencies

Protocol-specific SDKs are optional peer dependencies:

```bash
# For Fabric integration
npm install @hyperledger/fabric-gateway @grpc/grpc-js

# For Besu integration
npm install ethers

# For STARK proofs
npm install starknet

# For observability
npm install @opentelemetry/api @opentelemetry/sdk-node
```

## Documentation

- [Main Repository](https://github.com/psavelis/enterprise-blockchain)
- [Live Demo](https://github.com/psavelis/enterprise-blockchain#live-demo)
- [Architecture Guide](https://github.com/psavelis/enterprise-blockchain/blob/main/docs/architecture/README.md)
- [Skills Reference](https://github.com/psavelis/enterprise-blockchain/tree/main/skills)

## License

Apache 2.0
