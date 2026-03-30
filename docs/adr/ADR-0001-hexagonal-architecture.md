# ADR-0001: Hexagonal Architecture with Domain-Driven Design

## Status

Accepted

## Context

Enterprise blockchain applications integrate with multiple external systems: distributed ledgers (Fabric, Besu, Corda), HSMs, external APIs, and databases. These integrations have different lifecycles, failure modes, and testing requirements.

We needed an architecture that:

1. Isolates domain logic from infrastructure concerns
2. Allows swapping blockchain protocols without rewriting business rules
3. Enables testing domain logic without running actual blockchains
4. Supports gradual migration between protocols

## Decision

We adopt **Hexagonal Architecture** (Ports and Adapters) combined with **Domain-Driven Design** principles.

### Layer Structure

```
Domain Layer      → Entities, value objects, repository ports, domain services
Application Layer → Use case orchestration, depends on domain ports
Infrastructure    → SDK clients, database adapters, protocol adapters
```

### Key Rules

1. **Domain depends on nothing external** - Domain modules define port interfaces; they never import SDK types
2. **Dependencies point inward** - Infrastructure implements domain ports; domain never references infrastructure
3. **Ports define capabilities** - Each port represents a capability the domain needs (persistence, signing, anchoring)
4. **Adapters are replaceable** - Multiple adapters can implement the same port (in-memory for tests, SDK for production)

## Consequences

### Positive

- Domain logic testable with in-memory adapters (no blockchain required)
- Protocol changes isolated to adapter layer
- Clear boundaries between teams (domain vs infrastructure)
- `skills/` files can reference canonical port interfaces

### Negative

- More interfaces to maintain
- Indirection adds cognitive load for new contributors
- Must resist temptation to take shortcuts (direct SDK imports)

## References

- `skills/README.md:44-59` - Architecture principles
- `skills/platform-selection.md:88-91` - Port interface stability
- `modules/traceability/src/domain/ports.ts` - Example port definition
- `modules/traceability/src/infrastructure/in-memory-store.ts` - Example adapter
