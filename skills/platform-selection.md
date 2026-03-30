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

| Protocol | Privacy Model                      | Consensus                 | Contract Language | Fit                                     |
| -------- | ---------------------------------- | ------------------------- | ----------------- | --------------------------------------- |
| Besu     | Privacy groups (Tessera)           | QBFT, IBFT2               | Solidity          | Settlement, token issuance, anchoring   |
| Fabric   | Channels, private data collections | Raft, etcdraft            | Go, TypeScript    | Endorsement workflows, traceability     |
| Corda    | Point-to-point, need-to-know       | Notary (single/clustered) | Kotlin            | Bilateral agreements, regulated finance |

**Besu**: Permissioned EVM. Supports ERC standards, Solidity tooling (Foundry), JSON-RPC. Privacy groups isolate state between participant subsets.

**Fabric**: Channel-based isolation. Endorsement policies define which peers must sign before commit. Transient data enables off-chain secrets.

**Corda**: Flow-based bilateral transactions. Only parties to a deal see the data. Notary prevents double-spend without global ordering.

## Architecture

```
Business Scenario
    ↓
docs/architecture/scenario-to-protocol-mapping.md
    ↓
modules/protocols/{besu,fabric,corda}/src/index.ts  ← Protocol Adapter (Port)
    ↓
modules/integrations/{besu-client,fabric-gateway,corda-gateway}/  ← SDK Client (Adapter)
```

Protocol adapters implement the Ports pattern (Hexagonal Architecture):

- Domain modules depend on port interfaces, not SDK implementations
- Adapters translate domain events to platform-specific transaction shapes
- No business logic in adapters; transformation only

## Decision Criteria

| Criterion                  | Besu                   | Fabric                   | Corda           |
| -------------------------- | ---------------------- | ------------------------ | --------------- |
| EVM compatibility required | Yes                    | No                       | No              |
| Multi-party endorsement    | Privacy groups         | Endorsement policies     | Flow sessions   |
| Token standards            | ERC-20/721/1155        | Custom chaincode         | None native     |
| Bilateral confidentiality  | Limited                | Private data collections | Native          |
| Cross-chain anchoring      | Native (public anchor) | Requires oracle          | Requires oracle |

## Anti-patterns

**Selecting Besu for "Ethereum ecosystem"**: Permissioned Besu has no public liquidity, no token markets, no DeFi integrations. Ecosystem benefits do not transfer.

**One Fabric channel per transaction type**: Channels are heavyweight (separate ledger, separate gossip). Use private data collections for field-level privacy within a channel.

**Corda for multi-party coordination**: Corda flows are bilateral by default. N-party transactions require chained flows or explicit session management.

**Ignoring finality guarantees**: All three protocols provide deterministic finality. Do not build fork-handling logic for permissioned networks.

## References

- `docs/architecture/platform-decision-matrix.md`
- `docs/architecture/scenario-to-protocol-mapping.md`
- `modules/protocols/besu/src/index.ts`
- `modules/protocols/fabric/src/index.ts`
- `modules/protocols/corda/src/index.ts`
