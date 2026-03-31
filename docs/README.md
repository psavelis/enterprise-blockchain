# Documentation

Repository documentation and reference material for enterprise blockchain patterns.

## Quick Navigation

| Resource                         | Description                                  |
| -------------------------------- | -------------------------------------------- |
| [study-guide.md](study-guide.md) | Recommended reading path for architects      |
| [examples.md](examples.md)       | Runnable example catalog (22 demonstrations) |
| [architecture/](architecture/)   | Technical architecture and platform guidance |
| [security/](security/)           | Threat model and security analysis           |
| [research/](research/)           | Industry reference implementations           |
| [presentation/](presentation/)   | Conference slide deck and diagrams           |

## Companion Resources

- **[skills/](../skills/)** — Structured knowledge files for domain patterns (platform selection, MPC, HSM, selective disclosure, traceability)
- **[modules/](../modules/)** — Reusable TypeScript modules implementing hexagonal architecture
- **[examples/](../examples/)** — 22 runnable case studies demonstrating each pattern

## Architecture Guides

- [overview.md](architecture/overview.md) — Layering model and dependency direction
- [modules.md](architecture/modules.md) — Hexagonal structure per domain module
- [platform-decision-matrix.md](architecture/platform-decision-matrix.md) — Fabric vs Besu vs Corda selection criteria
- [scenario-to-protocol-mapping.md](architecture/scenario-to-protocol-mapping.md) — Domain logic to transaction translation
- [integration-boundaries.md](architecture/integration-boundaries.md) — SDK and adapter scope
- [mpc-quantum-resistance.md](architecture/mpc-quantum-resistance.md) — Secret sharing and post-quantum threat model
- [hsm-integration-patterns.md](architecture/hsm-integration-patterns.md) — PKCS#11 mapping and key custody
- [observability.md](architecture/observability.md) — OpenTelemetry distributed tracing and metrics
- [infrastructure.md](architecture/infrastructure.md) — Docker Compose stack and Makefile reference
- [testing-guide.md](architecture/testing-guide.md) — Property-based testing strategy
- [post-quantum-transition.md](architecture/post-quantum-transition.md) — PQ migration playbook
- [production-deployment.md](architecture/production-deployment.md) — Moving from examples to production
- [local-demo-blueprint.md](architecture/local-demo-blueprint.md) — Infrastructure setup for local development

## Protocol Flows

- [fabric-traceability-flow.md](architecture/fabric-traceability-flow.md)
- [besu-order-sharing-flow.md](architecture/besu-order-sharing-flow.md)
- [corda-clearance-flow.md](architecture/corda-clearance-flow.md)
