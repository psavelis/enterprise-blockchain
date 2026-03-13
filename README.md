# Enterprise Blockchain Case Studies

TypeScript repository for enterprise blockchain case studies, protocol mappings, and integration patterns.

The repository is organized around reusable domain modules and runnable examples. The focus is operational design: traceability, selective disclosure, credential verification, and reconciliation.

## Repository Layout

- `modules/`: Reusable TypeScript modules that model enterprise blockchain capabilities.
- `examples/`: Runnable case studies, one folder per scenario.
- `docs/`: Research material, presentation assets, and supporting documentation.
- `scripts/`: Utility entrypoints for repository workflows.

## Included Case Studies

1. `food-recall-response`: Recall planning for contaminated or temperature-exposed food lots.
2. `consortium-order-sharing`: Selective disclosure for shared purchase orders across a consortium.
3. `hospital-staffing-clearance`: Credential and sanction checks before assigning clinical work.
4. `aid-voucher-reconciliation`: Voucher settlement and exception reporting for humanitarian aid.

## Protocol Projection Examples

In addition to the business scenarios, the repository includes protocol-focused projection examples that show the transaction shapes a team might hand to a real platform runtime.

1. `fabric-traceability-projection`: Fabric chaincode-style invocations for recall and shipment events.
2. `besu-order-privacy-projection`: Besu privacy-group contract calls for selective disclosure.
3. `corda-clearance-flow-projection`: Corda flow/state payloads for staffing clearance decisions.

## MPC and Key Management Examples

Three examples cover off-chain cryptographic techniques that complement the ledger-based scenarios.

1. `mpc-sealed-bid-auction`: Sealed-bid procurement auction using additive secret sharing across three competing suppliers.
2. `mpc-joint-risk-analysis`: Cross-institution aggregate credit-risk reporting with secret-shared inputs and threshold checks.
3. `quantum-resistant-key-sharing`: Threshold key distribution with Shamir secret sharing (3-of-5) and hash-ladder anchoring.

## Quick Start

```bash
npm install
npm run typecheck
npm run test
npm run examples
npm run demo:adapters
npm run demo:integrations
```

You can also run individual scenarios:

```bash
npm run example:food-recall
npm run example:order-sharing
npm run example:staffing-clearance
npm run example:aid-reconciliation
npm run example:fabric-projection
npm run example:besu-projection
npm run example:corda-projection
npm run example:fabric-gateway
npm run example:besu-ethers
npm run example:corda-rest
npm run example:mpc-auction
npm run example:mpc-risk-analysis
npm run example:quantum-key-sharing
```

## Design Goals

- Keep the examples close to operational problems faced by consortiums, regulators, and platform teams.
- Show where blockchain changes system behavior: auditability, provenance, privacy boundaries, and cross-organization coordination.
- Keep the repository small enough to study and structured enough to present.

## Protocol Adapters

The repository includes protocol adapters that map domain events into platform-specific transaction shapes.

- `modules/protocols/fabric/`: Chaincode-style command generation for endorsement-driven workflows.
- `modules/protocols/besu/`: EVM/Besu-style contract call generation for consortium deployments.
- `modules/protocols/corda/`: State-and-flow style command generation for point-to-point regulated workflows.

These modules model protocol semantics. They are not full application runtimes.

## MPC Module

- `modules/mpc/`: `MPCEngine` (additive secret sharing) and `QuantumResistantVault` (Shamir threshold sharing, hash-ladder anchoring). MPC operates off-chain; results can be anchored on-chain through the existing Besu or Fabric adapters.

## Integration Sketches

The repository also includes integration clients and request builders that show how a TypeScript service can move from domain logic to submission boundaries.

- `modules/integrations/fabric-gateway/`: Fabric Gateway-oriented proposal planning and identity scaffolding.
- `modules/integrations/besu-client/`: `ethers`-based transaction encoding for Besu or other EVM-compatible consortium networks.
- `modules/integrations/corda-gateway/`: REST-oriented request shaping for Corda-style workflow gateways.

These modules stay runnable offline while preserving realistic interfaces and payload shapes.

The SDK choices are real:

- Fabric uses `@hyperledger/fabric-gateway` plus `@grpc/grpc-js`.
- Besu uses `ethers` with a contract ABI under `contracts/`.
- Corda is demonstrated through an HTTP gateway boundary, which is the practical TypeScript integration model in most teams.

## Documentation

- Research notes live under `docs/research/`.
- Presentation material lives under `docs/presentation/` as a Marp deck.
- Architecture and platform guidance live under `docs/architecture/`.
- Each example folder includes a small scenario brief.

The architecture folder includes per-adapter flow documents for design reviews and presentation walkthroughs.

For guided reading and presentation prep, use [docs/study-guide.md](docs/study-guide.md).

## Quality Gates

Use the full validation command before publishing changes:

```bash
npm run verify
```

A GitHub Actions workflow is included to run the same checks on push and pull request.

Environment templates for the integration examples live under `examples/config/`.

The Besu path also includes a concrete Solidity contract source in [contracts/ConsortiumOrderRegistry.sol](contracts/ConsortiumOrderRegistry.sol).
