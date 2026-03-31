# Study Guide

Use this repository for architecture reviews, interviews, and technical demonstrations.

## Recommended Reading Order

### Core Architecture (Start Here)

1. [README.md](README.md) — Repository shape and commands
2. [architecture/overview.md](architecture/overview.md) — Layering model and dependency direction
3. [architecture/platform-decision-matrix.md](architecture/platform-decision-matrix.md) — Connect scenarios to platform choices
4. [architecture/scenario-to-protocol-mapping.md](architecture/scenario-to-protocol-mapping.md) — Business problem to transaction pattern
5. [architecture/integration-boundaries.md](architecture/integration-boundaries.md) — What a production service builds

### Infrastructure & Operations

6. [architecture/infrastructure.md](architecture/infrastructure.md) — Docker Compose stack, Makefile, CI workflows
7. [architecture/observability.md](architecture/observability.md) — OpenTelemetry tracing and metrics
8. [architecture/production-deployment.md](architecture/production-deployment.md) — Moving from examples to production

### Cryptography Deep Dives

9. [architecture/hsm-integration-patterns.md](architecture/hsm-integration-patterns.md) — PKCS#11 mapping and key custody
10. [architecture/mpc-quantum-resistance.md](architecture/mpc-quantum-resistance.md) — Secret sharing and threshold schemes
11. [architecture/post-quantum-transition.md](architecture/post-quantum-transition.md) — NIST FIPS 203/204 migration

### Testing & Quality

12. [architecture/testing-guide.md](architecture/testing-guide.md) — Property-based testing with fast-check

## Primary Files By Scenario

| Scenario                      | Scenario file                                     | Domain logic                          | Protocol layer                                  | Integration layer                                  |
| ----------------------------- | ------------------------------------------------- | ------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Food recall response          | `examples/food-recall-response/index.ts`          | `modules/traceability/src/index.ts`   | `modules/protocols/fabric/src/index.ts`         | `modules/integrations/fabric-gateway/src/index.ts` |
| Consortium order sharing      | `examples/consortium-order-sharing/index.ts`      | `modules/privacy/src/index.ts`        | `modules/protocols/besu/src/index.ts`           | `modules/integrations/besu-client/src/index.ts`    |
| Hospital staffing clearance   | `examples/hospital-staffing-clearance/index.ts`   | `modules/credentialing/src/index.ts`  | `modules/protocols/corda/src/index.ts`          | `modules/integrations/corda-gateway/src/index.ts`  |
| Aid voucher reconciliation    | `examples/aid-voucher-reconciliation/index.ts`    | `modules/aid-settlement/src/index.ts` | `docs/architecture/platform-decision-matrix.md` | `docs/architecture/integration-boundaries.md`      |
| MPC sealed-bid auction        | `examples/mpc-sealed-bid-auction/index.ts`        | `modules/mpc/src/index.ts`            | `docs/architecture/mpc-quantum-resistance.md`   | `docs/architecture/integration-boundaries.md`      |
| MPC joint risk analysis       | `examples/mpc-joint-risk-analysis/index.ts`       | `modules/mpc/src/index.ts`            | `docs/architecture/mpc-quantum-resistance.md`   | `docs/architecture/integration-boundaries.md`      |
| Quantum-resistant key sharing | `examples/quantum-resistant-key-sharing/index.ts` | `modules/mpc/src/quantum.ts`          | `docs/architecture/mpc-quantum-resistance.md`   | `docs/architecture/integration-boundaries.md`      |

For the MPC and quantum-resistance scenarios, the protocol and integration columns point to the architecture notes because these examples are intentionally off-chain and are not mapped to a single ledger adapter implementation.

## HSM & Post-Quantum Examples

| Scenario                | Scenario file                               | Module                      | Architecture guide                              |
| ----------------------- | ------------------------------------------- | --------------------------- | ----------------------------------------------- |
| HSM transaction signing | `examples/hsm-transaction-signing/index.ts` | `modules/hsm/src/index.ts`  | `docs/architecture/hsm-integration-patterns.md` |
| HSM key ceremony        | `examples/hsm-key-ceremony/index.ts`        | `modules/hsm/src/index.ts`  | `docs/architecture/hsm-integration-patterns.md` |
| HSM envelope encryption | `examples/hsm-envelope-encryption/index.ts` | `modules/hsm/src/index.ts`  | `docs/architecture/hsm-integration-patterns.md` |
| Kyber KEM key exchange  | `examples/kyber-kem-key-exchange/index.ts`  | `modules/mpc/src/kyber.ts`  | `docs/architecture/post-quantum-transition.md`  |
| Hybrid KEM settlement   | `examples/hybrid-kem-settlement/index.ts`   | `modules/mpc/src/hybrid.ts` | `docs/architecture/post-quantum-transition.md`  |
| Quantum-safe payment    | `examples/quantum-safe-payment/index.ts`    | `modules/mpc/src/`          | `docs/architecture/post-quantum-transition.md`  |

## Recommended Demo Flow

1. Run `npm run examples` to show business outcomes first.
2. Run `npm run demo:adapters` to show how those outcomes project into protocol-specific commands.
3. Run `npm run demo:integrations` to show how a TypeScript service would actually shape SDK or gateway requests.
4. Open [contracts/solidity/src/ConsortiumOrderRegistry.sol](../contracts/solidity/src/ConsortiumOrderRegistry.sol) to show the Besu path against a concrete on-chain contract.

## Infrastructure Demo Flow

1. Run `make up` to start the Docker Compose stack (Besu, Fabric, observability).
2. Run `make smoke` to verify services are healthy.
3. Open http://localhost:16686 (Jaeger) to show distributed traces.
4. Open http://localhost:9090 (Prometheus) to show metrics.
5. Run an example with tracing enabled:
   ```bash
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 npm run example:food-recall
   ```

## Testing Demo Flow

1. Run `npm test` to execute all tests including property-based tests.
2. Show `tests/hsm.property.test.ts` for envelope encryption invariants.
3. Show `tests/mpc.property.test.ts` for field arithmetic properties.
4. Explain fast-check shrinking when a counterexample is found.

## Review Notes

- The repository separates domain logic from platform selection.
- The adapter layer captures protocol semantics without moving business rules into platform code.
- The integration layer captures operational concerns: credentials, transport, RPC, gateway contracts, and environment configuration.
- The Corda material uses a gateway pattern because TypeScript is typically the integration surface rather than the CorDapp runtime.
- Property-based tests verify cryptographic invariants that unit tests miss.
- OpenTelemetry provides observability without vendor lock-in.

## Skills Reference

The [skills/](../skills/) folder contains structured knowledge files for AI-assisted development:

| Skill                         | Use When                                  |
| ----------------------------- | ----------------------------------------- |
| `platform-selection.md`       | Choosing between Fabric, Besu, Corda      |
| `hsm-key-management.md`       | Implementing PKCS#11 key operations       |
| `mpc-secret-sharing.md`       | Building threshold cryptography           |
| `selective-disclosure.md`     | Designing privacy-preserving data sharing |
| `traceability-recall.md`      | Implementing supply chain provenance      |
| `infrastructure-reference.md` | Configuring Docker Compose and CI         |
