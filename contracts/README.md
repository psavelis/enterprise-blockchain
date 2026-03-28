# Smart Contracts

Multi-chain contract suite spanning EVM (Besu), Hyperledger Fabric, and Corda.

## Structure

```
contracts/
├── solidity/          # Foundry project — EVM contracts for Besu
│   ├── src/           # Production contracts
│   └── test/          # Forge tests + invariant suites
├── fabric/            # Node.js chaincode for Fabric 2.5+
├── corda/             # Kotlin state machine (Contract + Flow + State)
├── *.json             # ABI exports consumed by TypeScript adapters
└── *.sol              # Root-level copies for quick reference
```

## Platforms

| Platform   | Language        | Contracts                                                                                    | Tests                        |
| ---------- | --------------- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| Besu (EVM) | Solidity 0.8.24 | `AidSettlement`, `ConsortiumOrderRegistry`, `TraceabilityAnchor`, `AidSettlementUpgradeable` | Foundry unit + invariant     |
| Fabric     | TypeScript      | `FoodTraceContract` (simulation + deployable)                                                | Module-level via `node:test` |
| Corda      | Kotlin          | `ProviderClearanceContract` + Flow                                                           | Contract verification rules  |

## Quick Start

### Solidity (Foundry)

```bash
cd contracts/solidity
forge build
forge test -vvv
```

### Fabric

See [fabric/README.md](fabric/README.md) for build and deployment instructions.

### Corda

The Kotlin contracts in `corda/` follow the standard Corda contract + flow pattern. They integrate with the `credentialing` TypeScript module via the Corda REST adapter.

## ABI Exports

The root-level `.json` files contain ABI definitions consumed by `modules/protocols/besu/`:

- `AidSettlement.json` — Grant/claim settlement
- `ConsortiumOrderRegistry.json` — Multi-audience order sharing
- `TraceabilityAnchor.json` — Cross-chain lot verification
