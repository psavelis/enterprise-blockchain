# STARK Settlement

Production-grade zero-knowledge proof generation for cross-border settlement using StarkWare's Stone prover and 3-tier recursive proof aggregation.

## When to Use

- Implementing cross-border settlement with cryptographic finality
- Aggregating thousands of transactions into succinct proofs
- Multi-rail settlement (Solana, Bitcoin, Fiat) with proof commitments
- Quantum-resistant transaction verification via STARK proofs
- High-throughput systems requiring 8,192+ transactions per block

## When NOT to Use

- Simple point-to-point transfers without proof requirements
- Low-volume applications where proof overhead exceeds benefit
- Systems without Docker or compute resources for Stone prover (8GB+ RAM)
- When simpler hash commitments suffice for audit requirements

## Key Concepts

### 3-Tier Proof Hierarchy

```
                    ┌─────────────────────────────────┐
                    │      Tier-2 Block Proof         │
                    │   (64 Tier-1 = 8,192 txs)       │
                    └───────────────┬─────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
 ┌────────┴────────┐       ┌────────┴────────┐       ┌────────┴────────┐
 │   Tier-1 #1     │  ...  │   Tier-1 #32    │  ...  │   Tier-1 #64    │
 │  (128 base)     │       │   (128 base)    │       │   (128 base)    │
 └────────┬────────┘       └────────┬────────┘       └────────┬────────┘
          │                         │                         │
 ┌────────┴────────┐       ┌────────┴────────┐       ┌────────┴────────┐
 │  Base Proofs    │       │  Base Proofs    │       │  Base Proofs    │
 │   (128 txs)     │       │   (128 txs)     │       │   (128 txs)     │
 └─────────────────┘       └─────────────────┘       └─────────────────┘
```

### Proof Components

- **Base Proof**: Single transaction state transition (8 field element public inputs)
- **Tier-1 Proof**: Recursive aggregation of 128 base proofs with state continuity
- **Tier-2 Block Proof**: Final proof over 64 Tier-1 proofs (8,192 transactions)
- **Proof Commitment**: SHA-256 hash for on-chain anchoring (32 bytes / 64 hex chars)

### Settlement Rails

- **Solana**: VersionedTransaction with address lookup tables
- **Bitcoin**: PSBT with OP_RETURN proof commitment
- **Fiat**: ISO 20022 pain.001 credit transfer

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Application Services                            │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────────┐       │
│  │LedgerService│  │AggregatorService │  │SettlementService  │       │
│  └─────────────┘  └──────────────────┘  └───────────────────┘       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                       Domain Ports                                   │
│  StarkProofGeneratorPort │ LedgerPersistencePort │ SettlementPorts  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                    Infrastructure Adapters                           │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────┐    │
│  │StoneProofAdapter│  │MockStarkAdapter │  │StarknetProofAdapter│    │
│  └────────────────┘  └─────────────────┘  └────────────────────┘    │
│          │                                                           │
│          ▼                                                           │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │               Stone Prover (Docker gRPC)                        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                │ │
│  │  │cpu_air_prover│ │cpu_air_verifier│ │prover-rpc│             │ │
│  │  └────────────┘  └────────────┘  └────────────┘                │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation

### Context Factory

```typescript
import {
  createDefaultContext, // Small batches for demos (8/4)
  createProductionContext, // Full batches with Stone prover (128/64)
  createTestContext, // Minimal batches for unit tests (2/2)
} from "@enterprise-blockchain/stark-settlement";

// Demo mode (no Docker required)
const demoCtx = createDefaultContext();

// Production mode (requires Stone prover Docker)
const prodCtx = createProductionContext({
  proverEndpoint: "localhost:10000",
  cairoArtifactsPath: "./cairo/artifacts",
});

// Fallback to mock if Stone prover unavailable
const fallbackCtx = createProductionContext({
  useMockProver: true,
});
```

### Transaction Flow

```typescript
const ledger = new LedgerService(ctx);
const aggregator = new AggregatorService(ctx);
const settler = new SettlementService(ctx);

// 1. Create accounts
const alice = await ledger.createAccount({
  externalAddress: "0x...",
  assetType: "SOL",
  initialBalance: 1_000_000_000n,
});

// 2. Submit transactions (generates base proofs)
const { transaction, baseProof } = await ledger.submitTransaction({
  type: "transfer",
  fromAccountId: alice.id,
  toAccountId: bob.id,
  assetType: "SOL",
  amount: 100_000_000n,
  secretKey: aliceSecretKey, // ML-DSA-65 signature
});

// 3. Aggregate proofs
const blockProof = await aggregator.processToBlockProof();

// 4. Settle to external chains
const results = await settler.settleAllRails(blockProof);
```

### Cairo Circuits

Located in `cairo/src/`:

- `state_transition.cairo`: Base proof circuit
- `tier1_aggregator.cairo`: Tier-1 aggregation circuit
- `tier2_block.cairo`: Final block proof circuit

Build with:

```bash
cd cairo && make build
```

### Docker Compose

```bash
# Start Stone prover
docker compose up stone-prover -d

# Check health
curl -s http://localhost:9100/metrics | grep prover

# Run example with real prover
npm run example:stark-settlement -- --real-prover
```

## Must-Preserve Invariants

1. **Batch Sizes**: Tier-1 requires exactly 128 base proofs; Tier-2 requires exactly 64 Tier-1 proofs
2. **State Continuity**: Each proof's post-state must equal the next proof's pre-state
3. **Idempotency Keys**: Must propagate through all proof tiers for exactly-once settlement
4. **ML-DSA-65 Signatures**: All transactions must be signed with post-quantum signatures
5. **Hexagonal Boundaries**: Domain layer must never import SDK or infrastructure code
6. **Proof Commitment Format**: 64-character hex SHA-256 for on-chain anchoring

## Anti-patterns

### Skipping Proof Tiers

Attempting to create block proofs directly from base proofs breaks recursive verification and state continuity guarantees.

### Inconsistent State Roots

Reusing state roots across transactions or failing to update them after each transaction corrupts the Merkle tree and invalidates proofs.

### Ignoring Batch Size Requirements

Production batch sizes (128/64) must be used in CI validation. Demo batch sizes are only for local development speed.

### Direct SDK Imports in Domain

Cairo or starknet.js imports in domain layer violate hexagonal architecture. All STARK operations must go through ports.

## References

- Module: `modules/stark-settlement/`
- Adapters: `modules/stark-settlement/src/infrastructure/adapters/`
- Cairo Circuits: `cairo/src/`
- Docker: `infra/docker/stone-prover/`
- Terraform: `infra/modules/stone-prover/`
- Example: `examples/stark-cross-border-settlement/`
- Domain Ports: `modules/stark-settlement/src/domain/ports.ts`
- Value Objects: `modules/stark-settlement/src/domain/value-objects.ts`
