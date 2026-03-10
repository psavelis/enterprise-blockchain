# Study Guide

Use this repository for architecture reviews, interviews, and technical demonstrations.

## Recommended Reading Order

1. Start with [README.md](README.md) for repository shape and commands.
2. Review [docs/architecture/overview.md](docs/architecture/overview.md) to understand the layering model.
3. Read [docs/architecture/platform-decision-matrix.md](docs/architecture/platform-decision-matrix.md) to connect scenarios to platform choices.
4. Use [docs/architecture/scenario-to-protocol-mapping.md](docs/architecture/scenario-to-protocol-mapping.md) to move from business problem to transaction pattern.
5. Use [docs/architecture/integration-boundaries.md](docs/architecture/integration-boundaries.md) to explain what a production service actually has to build.

## Primary Files By Scenario

| Scenario | Scenario file | Domain logic | Protocol layer | Integration layer |
|---|---|---|---|---|
| Food recall response | `examples/food-recall-response/index.ts` | `modules/traceability/src/index.ts` | `modules/protocols/fabric/src/index.ts` | `modules/integrations/fabric-gateway/src/index.ts` |
| Consortium order sharing | `examples/consortium-order-sharing/index.ts` | `modules/privacy/src/index.ts` | `modules/protocols/besu/src/index.ts` | `modules/integrations/besu-client/src/index.ts` |
| Hospital staffing clearance | `examples/hospital-staffing-clearance/index.ts` | `modules/credentialing/src/index.ts` | `modules/protocols/corda/src/index.ts` | `modules/integrations/corda-gateway/src/index.ts` |
| Aid voucher reconciliation | `examples/aid-voucher-reconciliation/index.ts` | `modules/aid-settlement/src/index.ts` | `docs/architecture/platform-decision-matrix.md` | `docs/architecture/integration-boundaries.md` |

## Recommended Demo Flow

1. Run `npm run examples` to show business outcomes first.
2. Run `npm run demo:adapters` to show how those outcomes project into protocol-specific commands.
3. Run `npm run demo:integrations` to show how a TypeScript service would actually shape SDK or gateway requests.
4. Open [contracts/ConsortiumOrderRegistry.sol](contracts/ConsortiumOrderRegistry.sol) to show the Besu path against a concrete on-chain contract.

## Review Notes

- The repository separates domain logic from platform selection.
- The adapter layer captures protocol semantics without moving business rules into platform code.
- The integration layer captures operational concerns: credentials, transport, RPC, gateway contracts, and environment configuration.
- The Corda material uses a gateway pattern because TypeScript is typically the integration surface rather than the CorDapp runtime.