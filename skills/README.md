# Skills

Structured knowledge files for AI coding agents. Each skill provides domain context, implementation patterns, and architectural guidance for enterprise blockchain development.

## Architecture Principles

All skills enforce:

- **SOLID**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion
- **Hexagonal Architecture**: Ports define contracts; adapters implement infrastructure
- **Clean Architecture**: Domain logic isolated from framework and I/O concerns
- **Object Calisthenics**: Small methods, minimal nesting, first-class collections, no getters/setters on domain objects

## Skills Index

| Skill                                                 | Domain                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| [platform-selection](platform-selection.md)           | Protocol selection criteria for Besu, Fabric, Corda        |
| [selective-disclosure](selective-disclosure.md)       | Audience-based field projection, signed audit proofs       |
| [hsm-key-management](hsm-key-management.md)           | Hardware key storage, envelope encryption, key ceremonies  |
| [mpc-secret-sharing](mpc-secret-sharing.md)           | Additive shares, Shamir threshold, commitment verification |
| [traceability-recall](traceability-recall.md)         | Lot anchoring, shipment telemetry, recall assessment       |
| [integration-adapters](integration-adapters.md)       | SDK clients, retry policies, gas/nonce management          |
| [smart-contract-patterns](smart-contract-patterns.md) | AccessControl, Pausable, UUPS, invariant testing           |

## Skill Structure

```
1. When to Use       — trigger conditions
2. When NOT to Use   — anti-patterns, wrong scenarios
3. Key Concepts      — domain terms, relationships
4. Architecture      — layers, ports, adapters
5. Implementation    — code structure, API surface
6. Anti-patterns     — common mistakes with explanations
7. References        — repo file paths
```

## Quality Standards

- Third-person voice: "Implements X" not "I help with X"
- Specific triggers: "Use when integrating Fabric Gateway SDK" not "Helps with Fabric"
- Explain trade-offs and decision criteria
- Document anti-patterns with rationale
- Under 2,000 words per skill
