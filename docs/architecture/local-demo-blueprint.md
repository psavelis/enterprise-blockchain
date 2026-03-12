# Local Demo Blueprint

This blueprint describes how to evolve the repository from offline demonstrations into a live local lab.

## Fabric path

- Use the Hyperledger Fabric test network from `fabric-samples`.
- Deploy a Node.js chaincode that mirrors the `FoodTraceContract` transaction names used in this repository.
- Point the environment variables from [examples/config/fabric.env.example](examples/config/fabric.env.example) at generated certificates and peer endpoints.
- Replace proposal planning with live `evaluate` and `submit` calls through [modules/integrations/fabric-gateway/src/index.ts](modules/integrations/fabric-gateway/src/index.ts).

## Besu path

- Start a local Besu or Quorum devnet.
- Compile and deploy [contracts/ConsortiumOrderRegistry.sol](contracts/ConsortiumOrderRegistry.sol).
- Update [examples/config/besu.env.example](examples/config/besu.env.example) with the deployed contract address and funded test key.
- Extend [modules/integrations/besu-client/src/index.ts](modules/integrations/besu-client/src/index.ts) from request building into actual `sendTransaction` flows.

## Corda path

- Stand up a gateway or façade service in front of a JVM-based Corda network.
- Map the payload produced by [modules/integrations/corda-gateway/src/index.ts](modules/integrations/corda-gateway/src/index.ts) into a real flow-start endpoint.
- Keep TypeScript responsible for orchestration, API security, and request shaping.

## Implementation Notes

- Bring one platform to life at a time rather than trying to demo all three live in one sitting.
- Keep the domain and adapter layers unchanged while swapping the integration layer from offline to live.
- Treat the existing tests as regression coverage for the modeling decisions, not as infrastructure validation.
