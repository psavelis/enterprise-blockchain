# Cairo Circuits for STARK Settlement Layer

This directory contains Cairo circuits for generating cryptographically valid STARK proofs in the 3-tier recursive aggregation pipeline.

## Architecture

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

## Circuits

### state_transition.cairo (Base Proof)

Proves validity of a single ledger transaction:

- Verifies sender balance in pre-state Merkle tree
- Verifies balance transition (sender decreases, recipient increases)
- Verifies post-state Merkle tree update
- Supports deposit, transfer, and withdrawal transaction types

Public inputs (8 field elements):

1. `pre_state_root` - Merkle root before transaction
2. `post_state_root` - Merkle root after transaction
3. `tx_hash` - Hash of transaction data
4. `tx_type_hash` - Transaction type identifier
5. `from_account_hash` - Sender account hash
6. `to_account_hash` - Recipient account hash
7. `amount` - Transaction amount
8. `idempotency_key_hash` - For exactly-once semantics

### tier1_aggregator.cairo (Tier-1 Proof)

Recursively aggregates exactly 128 base proofs:

- Verifies all base proofs are valid
- Verifies state continuity between consecutive proofs
- Computes Merkle root over all proof commitments
- Preserves idempotency keys for settlement

Public inputs:

1. `first_pre_state_root` - Initial state before batch
2. `last_post_state_root` - Final state after batch
3. `aggregated_commitment` - Merkle root of 128 proof commitments
4. `tx_count` - Must equal 128

### tier2_block.cairo (Block Proof)

Recursively aggregates exactly 64 Tier-1 proofs:

- Verifies all Tier-1 proofs are valid
- Verifies state continuity across Tier-1 boundaries
- Produces final block commitment for settlement
- Total: 64 \* 128 = 8,192 transactions per block

Public inputs:

1. `final_state_root` - Ledger state after all transactions
2. `block_number` - Monotonically increasing identifier
3. `total_tx_count` - Must equal 8,192
4. `tier1_merkle_root` - Merkle root of 64 Tier-1 commitments

## Building

Prerequisites:

- Scarb (Cairo package manager): https://docs.swmansion.com/scarb/

```bash
# Install Scarb
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh

# Build circuits
make build

# Run tests
make test

# Format source
make fmt
```

Compiled artifacts are written to `artifacts/` directory.

## Integration

The compiled Cairo programs are loaded by the Stone prover adapter:

```typescript
import { StoneProofAdapter } from "./infrastructure/adapters/stone-proof-adapter";

const adapter = new StoneProofAdapter(clock, {
  cairoArtifactsPath: "./cairo/artifacts",
  proverEndpoint: "localhost:10000",
});

// Generate base proof for a transaction
const baseProof = await adapter.generateBaseProof(
  tx,
  preStateRoot,
  postStateRoot,
);

// Aggregate 128 base proofs into Tier-1
const tier1Proof = await adapter.aggregateTier1(baseProofs);

// Aggregate 64 Tier-1 proofs into block proof
const blockProof = await adapter.aggregateTier2(tier1Proofs);
```

## References

- Cairo language documentation: https://www.cairo-lang.org/
- StarkNet book: https://book.starknet.io/
- Stone prover: https://github.com/starkware-libs/stone-prover
- Pedersen hash: https://docs.starknet.io/architecture-and-concepts/cryptography/pedersen-hash/
