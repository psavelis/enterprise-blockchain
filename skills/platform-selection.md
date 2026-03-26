# Skill: Platform Selection (Besu vs Fabric vs Corda)

## When to use

When deciding which enterprise blockchain platform fits a consortium's requirements, or when mapping a business scenario to the right protocol.

## Key concepts

- **Besu (EVM/Solidity)**: Permissioned Ethereum. Best for multi-party state anchoring with privacy groups. Supports ERC standards, Solidity tooling (Foundry/Hardhat), and JSON-RPC APIs.
- **Fabric (Go/TypeScript chaincode)**: Channel-based privacy. Best for endorsement-driven workflows where organizations need fine-grained data isolation. Supports transient data for off-chain secrets.
- **Corda (Kotlin flows)**: Point-to-point regulated workflows. Best for bilateral or trilateral transactions where only parties to a deal see the data. Uses notary consensus, not global ordering.

## Decision matrix

| Criterion               | Besu                                  | Fabric                                  | Corda                                   |
| ----------------------- | ------------------------------------- | --------------------------------------- | --------------------------------------- |
| Privacy model           | Privacy groups (Tessera)              | Channels + private data collections     | Point-to-point, need-to-know            |
| Smart contract language | Solidity                              | Go, TypeScript, Java                    | Kotlin, Java                            |
| Consensus               | IBFT2, QBFT, Clique                   | Raft, etcdraft                          | Notary (single or clustered)            |
| Token standards         | ERC-20, ERC-721, ERC-1155             | Custom chaincode                        | None native                             |
| Best fit                | Anchoring, settlement, token issuance | Supply chain, traceability, endorsement | Regulated finance, bilateral agreements |

## Implementation pattern

```
scenario → docs/architecture/scenario-to-protocol-mapping.md
         → modules/protocols/{besu,fabric,corda}/src/index.ts  (adapter)
         → modules/integrations/{besu-client,fabric-gateway,corda-gateway}/  (client sketch)
```

Each protocol adapter transforms domain events into platform-specific transaction shapes without coupling business logic to infrastructure.

## Pitfalls

- Don't pick Besu just because "Ethereum". Permissioned Besu has no public liquidity or token ecosystem.
- Fabric channels are heavyweight — don't create one per transaction type.
- Corda flows are bilateral by default; multi-party coordination requires additional design.

## References

- `docs/architecture/platform-decision-matrix.md`
- `docs/architecture/scenario-to-protocol-mapping.md`
- `modules/protocols/besu/src/index.ts`
- `modules/protocols/fabric/src/index.ts`
- `modules/protocols/corda/src/index.ts`
