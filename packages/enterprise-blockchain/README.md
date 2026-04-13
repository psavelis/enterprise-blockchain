# @psavelis/enterprise-blockchain

Production-grade TypeScript modules for recursive STARK settlement, post-quantum cryptography (ML-KEM/ML-DSA), MPC, HSM, and multi-rail (Solana + Bitcoin + fiat) infrastructure.

[![npm version](https://img.shields.io/npm/v/@psavelis/enterprise-blockchain)](https://www.npmjs.com/package/@psavelis/enterprise-blockchain)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/psavelis/enterprise-blockchain/blob/main/LICENSE)

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

## Industry Use Cases

### 1. Post-Quantum Key Exchange (ML-KEM-768)

**Use case:** Secure key agreement for encrypted channels, protecting against "harvest now, decrypt later" quantum attacks.

```typescript
import { KyberKem } from "@psavelis/enterprise-blockchain/mpc";

// Server generates long-term key pair
const kem = new KyberKem();
const server = kem.generateKeyPair("ml-kem-768");

// Client encapsulates a shared secret using server's public key
const { ciphertext, sharedSecret: clientKey } = kem.encapsulate(
  server.publicKey,
  "ml-kem-768",
);

// Server decapsulates to derive the same shared secret
const serverKey = kem.decapsulate(ciphertext, server.secretKey, "ml-kem-768");

// Both parties now have identical 32-byte keys for AES-256-GCM
console.log(clientKey.equals(serverKey)); // true
```

---

### 2. Post-Quantum Digital Signatures (ML-DSA-65)

**Use case:** Transaction signing, document authentication, code signing — quantum-resistant.

```typescript
import { MlDsaSigner } from "@psavelis/enterprise-blockchain/mpc";

const signer = new MlDsaSigner();
const { publicKey, secretKey } = signer.generateKeyPair("ml-dsa-65");

// Sign a transaction payload
const payload = JSON.stringify({
  from: "alice",
  to: "bob",
  amount: "1000000",
  timestamp: Date.now(),
});

const { signature } = signer.sign(payload, secretKey, "ml-dsa-65");

// Anyone can verify with the public key
const isValid = signer.verify(payload, signature, publicKey, "ml-dsa-65");
console.log("Signature valid:", isValid); // true
```

---

### 3. Hybrid Key Encapsulation (X25519 + ML-KEM-768)

**Use case:** Defense-in-depth during the quantum transition — secure if either algorithm holds.

```typescript
import { HybridKem } from "@psavelis/enterprise-blockchain/mpc";

const hybrid = new HybridKem();

// Recipient generates both classical and post-quantum key pairs
const recipient = hybrid.generateKeyPairs();

// Sender encapsulates using both channels
const { x25519EphemeralPublicKeyDer, kyberCiphertext, combinedKey } =
  hybrid.encapsulate(recipient.x25519.publicKey, recipient.kyber.publicKey);

// Recipient decapsulates to derive the same combined key
const { combinedKey: recipientKey } = hybrid.decapsulate(
  recipient.x25519.privateKey,
  recipient.kyber.secretKey,
  x25519EphemeralPublicKeyDer,
  kyberCiphertext,
);

// Both parties have identical 32-byte keys
console.log(combinedKey.equals(recipientKey)); // true
```

---

### 4. Threshold Secret Sharing (Shamir k-of-n)

**Use case:** Key custody, board approvals, disaster recovery — any 3 of 5 shareholders can reconstruct.

```typescript
import { QuantumResistantVault } from "@psavelis/enterprise-blockchain/mpc";

const vault = new QuantumResistantVault({ fieldMode: "production" });

// CEO's master key (256-bit secret)
const masterKey =
  0xdeadbeefcafebabedeadbeefcafebabedeadbeefcafebabedeadbeefcafebaben;

// Distribute to 5 board members, require 3 to reconstruct
const shareholders = ["ceo", "cfo", "cto", "legal", "audit"];
const shares = vault.distributeSecret(masterKey, shareholders, 3);

// Any 3 shareholders can reconstruct
const subset = [shares.get("ceo")!, shares.get("cto")!, shares.get("audit")!];
const reconstructed = vault.reconstructSecretBigint(subset, 3);

console.log(reconstructed === masterKey); // true
// With only 2 shares: returns null (k-1 reveals nothing)
```

---

### 5. MPC Confidential Computation

**Use case:** Joint risk analysis, sealed-bid auctions — compute on combined data without revealing inputs.

```typescript
import { MPCEngine } from "@psavelis/enterprise-blockchain/mpc";

const mpc = new MPCEngine();

// Three banks want to compute total market exposure without revealing individual positions
["bank-a", "bank-b", "bank-c"].forEach((id) =>
  mpc.registerParty({ id, name: id, endpoint: `https://${id}.example.com` }),
);

// Each bank splits their exposure into additive shares
const exposures = {
  "bank-a": 50_000_000,
  "bank-b": 75_000_000,
  "bank-c": 25_000_000,
};
const computationId = "market-exposure-q1-2026";

for (const [bankId, exposure] of Object.entries(exposures)) {
  const shares = mpc.splitSecret(exposure, ["bank-a", "bank-b", "bank-c"]);
  const myShare = shares.find((s) => s.partyId === bankId)!;
  mpc.submitShare(computationId, myShare);
}

// Aggregate reveals total (150M) without exposing individual positions
const result = mpc.compute(computationId, "sum");
console.log("Total market exposure:", result.aggregate); // 150,000,000
```

---

### 6. HSM Envelope Encryption

**Use case:** Encrypt sensitive data at rest with keys that never leave the HSM.

```typescript
import { HsmClient } from "@psavelis/enterprise-blockchain/hsm";

const hsm = new HsmClient();
hsm.initialize({ slotId: "slot-1", label: "production-hsm" });

// Generate a Key Encryption Key (KEK) inside the HSM
hsm.generateSymmetricKey("master-kek");

// Encrypt a sensitive document
const document = JSON.stringify({
  ssn: "123-45-6789",
  accountNumber: "9876543210",
  balance: 1_500_000,
});

const { wrappedDek, encryptedRecord } = hsm.encryptWithEnvelope(
  "master-kek",
  document,
);

// Decrypt when needed
const decrypted = hsm.decryptWithEnvelope(wrappedDek, encryptedRecord);
console.log(JSON.parse(decrypted).balance); // 1500000

// Full audit trail
const auditLog = hsm.getAuditLog();
console.log("Operations logged:", auditLog.length);
```

---

### 7. HSM Transaction Signing

**Use case:** Sign blockchain transactions with audited, hardware-protected keys.

```typescript
import { HsmClient } from "@psavelis/enterprise-blockchain/hsm";

const hsm = new HsmClient();
hsm.initialize({ slotId: "slot-1", label: "signing-hsm" });

// Generate signing key pair (EC P-256)
const { keyLabel, publicKeyPem } = hsm.generateKeyPair("tx-signing-key");

// Sign a transaction
const transaction = {
  type: "transfer",
  from: "0xAlice",
  to: "0xBob",
  value: "1000000000000000000", // 1 ETH
  nonce: 42,
  chainId: 1,
};

const { signature, digestHex } = hsm.sign(
  keyLabel,
  JSON.stringify(transaction),
);

// Verify signature (typically done by blockchain nodes)
const isValid = hsm.verify(keyLabel, JSON.stringify(transaction), signature);
console.log("Transaction signature valid:", isValid); // true
```

---

### 8. STARK Settlement Layer

**Use case:** Cross-border payments with recursive proof aggregation and multi-rail settlement.

```typescript
import {
  createDefaultContext,
  LedgerService,
  AggregatorService,
  SettlementService,
  MockSolanaAdapter,
  MockBitcoinAdapter,
  MockFiatAdapter,
} from "@psavelis/enterprise-blockchain/stark-settlement";

// Initialize services
const ctx = createDefaultContext({ tier1BatchSize: 4, tier2BatchSize: 2 });
const ledger = new LedgerService(ctx);
const aggregator = new AggregatorService(ctx);
const settler = new SettlementService(ctx, {
  solana: new MockSolanaAdapter(),
  bitcoin: new MockBitcoinAdapter(),
  fiat: new MockFiatAdapter(),
});

// Create mirror accounts
const alice = await ledger.createAccount({
  accountId: "alice",
  initialBalance: 10_000_000_000n,
});
const bob = await ledger.createAccount({
  accountId: "bob",
  initialBalance: 0n,
});

// Submit cross-border payment
const tx = await ledger.submitTransaction({
  type: "transfer",
  fromAccountId: "alice",
  toAccountId: "bob",
  assetType: "SOL",
  amount: 1_000_000_000n, // 1 SOL
});

// Generate proofs (Base → Tier-1 → Tier-2 block proof)
const blockProof = await aggregator.processToBlockProof();
console.log("Block proof generated:", blockProof.blockNumber);

// Settle to multiple rails
const result = await settler.settleAllRails(blockProof);
console.log("Solana:", result.solana?.status); // "confirmed"
console.log("Bitcoin:", result.bitcoin?.status); // "confirmed"
console.log("Fiat:", result.fiat?.status); // "confirmed"
```

---

### 9. Quantum-Safe Bitcoin (Pay-to-Merkle-Root)

**Use case:** Bitcoin outputs that resist quantum attacks by hiding public keys until spend time.

```typescript
import {
  createP2MROutput,
  createSingleSigLeaf,
  createTimelockLeaf,
  createMultisigLeaf,
  buildSpendProof,
  verifySpendProofStructure,
} from "@psavelis/enterprise-blockchain/p2mr";

// Create a quantum-safe output with multiple spending paths
const primaryKeyHash = "a1b2c3d4..."; // SHA-256 of primary public key
const backupKeyHash = "e5f6a7b8..."; // SHA-256 of backup public key
const boardKeyHashes = ["k1...", "k2...", "k3..."]; // 2-of-3 multisig

const { output, tree } = createP2MROutput({
  leaves: [
    createSingleSigLeaf(primaryKeyHash), // Path 0: Primary key
    createTimelockLeaf(backupKeyHash, 1893456000), // Path 1: Backup after 2030-01-01
    createMultisigLeaf(boardKeyHashes, 2), // Path 2: 2-of-3 board approval
  ],
  value: 100_000_000n, // 1 BTC in satoshis
});

// Only merkleRoot is stored on-chain (no public keys exposed!)
console.log("Output ID:", output.outputId);
console.log("Merkle root:", output.merkleRoot);

// Later, spend via primary key (path 0)
const proof = buildSpendProof({
  outputId: output.outputId,
  tree,
  leafIndex: 0,
  witness: {
    publicKeys: [primaryPublicKey],
    signatures: [signature], // ML-DSA-65 signature
  },
});

// Verify proof structure before broadcasting
const verification = verifySpendProofStructure(proof, output);
console.log("Valid spend proof:", verification.valid); // true
```

---

## Subpath Exports

| Import Path                                            | Description                                           |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `@psavelis/enterprise-blockchain/mpc`                  | ML-KEM, ML-DSA, Hybrid KEM, Shamir SSS, MPC Engine    |
| `@psavelis/enterprise-blockchain/hsm`                  | PKCS#11 HSM simulator, envelope encryption, signing   |
| `@psavelis/enterprise-blockchain/p2mr`                 | Pay-to-Merkle-Root quantum-safe Bitcoin outputs       |
| `@psavelis/enterprise-blockchain/stark-settlement`     | 3-tier STARK proof aggregation, multi-rail settlement |
| `@psavelis/enterprise-blockchain/credentialing`        | Clinical credential verification (healthcare)         |
| `@psavelis/enterprise-blockchain/privacy`              | Selective disclosure ledger (finance)                 |
| `@psavelis/enterprise-blockchain/traceability`         | Supply-chain traceability (food/pharma)               |
| `@psavelis/enterprise-blockchain/aid-settlement`       | Aid voucher reconciliation (humanitarian)             |
| `@psavelis/enterprise-blockchain/protocols`            | Fabric/Besu/Corda adapter interfaces                  |
| `@psavelis/enterprise-blockchain/integrations`         | SDK clients with circuit breaker patterns             |
| `@psavelis/enterprise-blockchain/shared`               | Utilities, crypto primitives, stores                  |
| `@psavelis/enterprise-blockchain/shared/telemetry`     | createTracer, createMeter, withSpan helpers           |
| `@psavelis/enterprise-blockchain/shared/telemetry-sdk` | OpenTelemetry SDK initialization                      |

---

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
│  StoneProofAdapter │ SolanaAdapter │ BitcoinAdapter │ FiatAdapter │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

| Feature                   | Standard/Implementation                           |
| ------------------------- | ------------------------------------------------- |
| Post-Quantum Key Exchange | NIST FIPS 203 (ML-KEM-768)                        |
| Post-Quantum Signatures   | NIST FIPS 204 (ML-DSA-65)                         |
| Hybrid KEM                | X25519 + ML-KEM-768 (Chrome/Firefox TLS approach) |
| STARK Proofs              | 3-tier recursive aggregation (8,192 tx/block)     |
| Multi-Rail Settlement     | Solana, Bitcoin (PSBT), Fiat (ISO 20022)          |
| HSM Integration           | PKCS#11-style with full audit logging             |
| Threshold Secret Sharing  | Shamir k-of-n with 256-bit production field       |
| Quantum-Safe Bitcoin      | BIP-360-inspired Pay-to-Merkle-Root               |
| Observability             | OpenTelemetry tracing and metrics                 |

---

## Peer Dependencies

Protocol-specific SDKs are optional peer dependencies:

```bash
# For STARK proofs (starknet.js)
npm install starknet

# For Besu/EVM integration
npm install ethers

# For Fabric integration
npm install @hyperledger/fabric-gateway @grpc/grpc-js

# For observability
npm install @opentelemetry/api @opentelemetry/sdk-node
```

---

## Requirements

- Node.js ≥ 22.14.0 (for native crypto support)
- TypeScript ≥ 5.0 (ESM modules)

---

## Documentation

- [Main Repository](https://github.com/psavelis/enterprise-blockchain)
- [Architecture Guide](https://github.com/psavelis/enterprise-blockchain/blob/main/docs/architecture/README.md)
- [22 Runnable Examples](https://github.com/psavelis/enterprise-blockchain/tree/main/examples)
- [Skills Reference](https://github.com/psavelis/enterprise-blockchain/tree/main/skills)

---

## License

Apache 2.0
