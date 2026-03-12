# Integration Boundaries

This repository includes an integration layer that sits after the domain and protocol adapter stages.

## Why This Layer Exists

- Architecture reviews often stop too early at domain models or transaction diagrams.
- Delivery teams need to understand what a TypeScript application would actually construct before it talks to Fabric, Besu, or a Corda gateway.
- Keeping these clients narrowly scoped preserves clarity without turning the repository into a deployment project.

## Included Integration Patterns

| Integration     | File                                               | Purpose                                                                                                            |
| --------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Fabric Gateway  | `modules/integrations/fabric-gateway/src/index.ts` | Builds gateway profile data, gRPC transport setup, and proposal plans for endorsement-driven chaincode submission. |
| Besu via ethers | `modules/integrations/besu-client/src/index.ts`    | Builds providers, signers, contracts, and encoded transaction requests for JSON-RPC submission.                    |
| Corda gateway   | `modules/integrations/corda-gateway/src/index.ts`  | Builds HTTP requests for flow invocation in a workflow-oriented network boundary.                                  |

## SDK Choices

- Hyperledger Fabric: `@hyperledger/fabric-gateway` with `@grpc/grpc-js` transport setup.
- Hyperledger Besu: `ethers` with a real ABI artifact and JSON-RPC provider structure.
- Corda: HTTP gateway integration from TypeScript, since CorDapp application code is typically JVM-based.

## Reading Order

1. Start with a business scenario under `examples/`.
2. Review the domain rules under `modules/`.
3. Inspect the protocol adapter under `modules/protocols/`.
4. Inspect the integration sketch under `modules/integrations/`.
5. Run `npm run demo:integrations` to compare the resulting payloads side by side.

## Scope Limits

- No live credentials or network endpoints are embedded.
- No attempt is made to simulate ordering services, privacy managers, or notaries.
- The goal is to clarify request and transaction boundaries, not to replace deployment tooling.
