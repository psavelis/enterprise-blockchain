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

### Deployment Scripts

Foundry deployment scripts are in `solidity/script/`. Each script reads configuration from environment variables:

```bash
# Set deployer credentials
export PRIVATE_KEY="0x..."
export ADMIN_ADDRESS="0x..."  # Optional, defaults to deployer

# Deploy non-upgradeable AidSettlement
forge script script/DeployAidSettlement.s.sol:DeployAidSettlement \
  --rpc-url $RPC_URL --broadcast --verify

# Deploy UUPS-upgradeable AidSettlement with ERC1967 proxy
forge script script/DeployAidSettlementUpgradeable.s.sol:DeployAidSettlementUpgradeable \
  --rpc-url $RPC_URL --broadcast --verify

# Deploy ConsortiumOrderRegistry
forge script script/DeployConsortiumOrderRegistry.s.sol:DeployConsortiumOrderRegistry \
  --rpc-url $RPC_URL --broadcast --verify

# Deploy TraceabilityAnchor with optional oracle registration
export ORACLE_ADDRESS="0x..."  # Optional initial oracle
forge script script/DeployTraceabilityAnchor.s.sol:DeployTraceabilityAnchor \
  --rpc-url $RPC_URL --broadcast --verify
```

For local testing, use Anvil:

```bash
anvil &
forge script script/DeployAidSettlement.s.sol:DeployAidSettlement \
  --rpc-url http://localhost:8545 --broadcast
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
