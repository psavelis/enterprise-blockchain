# Platform Selection

Protocol selection framework for enterprise blockchain deployments.

## When to Use

- Evaluating Besu vs Fabric vs Corda for a consortium use case
- Mapping business requirements to protocol capabilities
- Designing multi-protocol architectures with cross-chain anchoring

## When NOT to Use

- Public blockchain selection (Ethereum mainnet, Polygon, etc.)
- Layer 2 scaling decisions
- Token economics design

## Key Concepts

| Protocol | Privacy Model                      | Consensus                 | Contract Language | Primary Fit                             |
| -------- | ---------------------------------- | ------------------------- | ----------------- | --------------------------------------- |
| Besu     | Privacy groups (Tessera)           | QBFT, IBFT2               | Solidity          | Settlement, token issuance, anchoring   |
| Fabric   | Channels, private data collections | Raft, etcdraft            | Go, TypeScript    | Endorsement workflows, traceability     |
| Corda    | Point-to-point, need-to-know       | Notary (single/clustered) | Kotlin            | Bilateral agreements, regulated finance |

**Besu**: Permissioned EVM. Supports ERC standards, Solidity tooling (Foundry), JSON-RPC. Privacy groups isolate state between participant subsets.

**Fabric**: Channel-based isolation. Endorsement policies define which peers must sign before commit. Private data collections for field-level privacy.

**Corda**: Flow-based bilateral transactions. Only parties to a deal see the data. Notary prevents double-spend without global ordering.

## Architecture

```
Business Scenario
    ↓
docs/architecture/scenario-to-protocol-mapping.md
    ↓
modules/protocols/src/                      ← Protocol Ports (Interfaces)
├── besu-port.ts
├── fabric-port.ts
└── corda-port.ts
    ↓
modules/protocols/{besu,fabric,corda}/src/  ← Protocol Adapters (Port Implementations)
├── index.ts
└── (stateless transformation logic)
    ↓
modules/integrations/                       ← SDK Clients (I/O, Retry, Connection)
├── besu-client/src/
├── fabric-gateway/src/
└── corda-gateway/src/
```

**Ports vs Adapters**: Ports define what operations are available (interfaces). Adapters implement how to translate domain events to protocol-specific shapes (stateless). Clients handle SDK connection and I/O (stateful).

## Decision Tree

```
Does use case require EVM compatibility?
├── Yes → Besu
│         ├── Need ERC-20/721/1155 tokens? → Besu
│         ├── Need Solidity tooling (Foundry)? → Besu
│         └── Need cross-chain anchoring from other protocols? → Besu
└── No  → Does use case require multi-party endorsement?
          ├── Yes → Fabric
          │         ├── Need channel isolation per business network? → Fabric
          │         ├── Need private data collections for field-level privacy? → Fabric
          │         └── Need Go/TypeScript chaincode? → Fabric
          └── No  → Does use case require bilateral confidentiality?
                    ├── Yes → Corda
                    │         ├── Need point-to-point transactions? → Corda
                    │         ├── Need notarized double-spend prevention? → Corda
                    │         └── Need regulatory compliance flows? → Corda
                    └── No  → Evaluate Besu (simplest EVM) or Fabric (most flexible)
```

## Decision Criteria

| Criterion                  | Besu                        | Fabric                   | Corda           |
| -------------------------- | --------------------------- | ------------------------ | --------------- |
| EVM compatibility required | Yes                         | No                       | No              |
| Multi-party endorsement    | Privacy groups              | Endorsement policies     | Flow sessions   |
| Token standards            | ERC-20/721/1155             | Custom chaincode         | None native     |
| Bilateral confidentiality  | Limited                     | Private data collections | Native          |
| Cross-chain anchoring      | Native (anchor contract)    | Requires oracle          | Requires oracle |
| Tooling ecosystem          | Foundry, Hardhat, ethers.js | Fabric SDK, peer CLI     | Corda SDK, REST |

## Must-Preserve Invariants

1. **Port interface stability**: Domain modules depend on port interfaces, never on SDK types
2. **Adapter statelessness**: Protocol adapters transform data only; no I/O or state
3. **Client isolation**: SDK clients own connection lifecycle and retry logic
4. **Error mapping**: Platform errors mapped to domain errors via `error-mapper.ts`

## Anti-patterns

**Selecting Besu for "Ethereum ecosystem"**: Permissioned Besu has no public liquidity, no token markets, no DeFi integrations. Ecosystem benefits do not transfer.

**One Fabric channel per transaction type**: Channels are heavyweight (separate ledger, separate gossip). Use private data collections for field-level privacy within a channel.

**Corda for multi-party coordination**: Corda flows are bilateral by default. N-party transactions require chained flows or explicit session management.

**Ignoring finality guarantees**: All three protocols provide deterministic finality. Do not build fork-handling logic for permissioned networks.

**Importing SDK types in domain**: Domain modules must depend on port interfaces only. SDK types leak infrastructure concerns.

**Mixing adapter and client logic**: Adapters transform shapes (pure functions). Clients handle I/O (async, fallible). Keep separated.

## Related Skills

- [integration-adapters](integration-adapters.md) — SDK client patterns for each platform
- [smart-contract-patterns](smart-contract-patterns.md) — Solidity patterns for Besu deployment
- [traceability-recall](traceability-recall.md) — Cross-chain anchoring (Fabric → Besu)

## References

- `docs/architecture/platform-decision-matrix.md`
- `docs/architecture/scenario-to-protocol-mapping.md`
- `modules/protocols/besu/src/index.ts`
- `modules/protocols/fabric/src/index.ts`
- `modules/protocols/corda/src/index.ts`
- `modules/protocols/src/besu-port.ts`
- `modules/protocols/src/fabric-port.ts`
- `modules/protocols/src/corda-port.ts`
