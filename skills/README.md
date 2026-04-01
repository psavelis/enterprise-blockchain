# Skills

Structured knowledge files for AI coding agents. Each skill provides domain context, implementation patterns, and architectural guidance for enterprise blockchain development.

## Quick Reference

| Task                                         | Skill                                                   |
| -------------------------------------------- | ------------------------------------------------------- |
| Choose Besu vs Fabric vs Corda               | [platform-selection](platform-selection.md)             |
| Add retry/circuit breaker to SDK client      | [integration-adapters](integration-adapters.md)         |
| Deploy Solidity contract with access control | [smart-contract-patterns](smart-contract-patterns.md)   |
| Sign transactions with HSM                   | [hsm-key-management](hsm-key-management.md)             |
| Implement sealed-bid auction                 | [mpc-secret-sharing](mpc-secret-sharing.md)             |
| Add quantum-resistant anchoring              | [post-quantum-crypto](post-quantum-crypto.md)           |
| Create quantum-safe outputs (BIP-360 style)  | [p2mr-quantum-safe](p2mr-quantum-safe.md)               |
| Project order data per audience              | [selective-disclosure](selective-disclosure.md)         |
| Track supply chain provenance                | [traceability-recall](traceability-recall.md)           |
| Set up local dev infrastructure              | [infrastructure-reference](infrastructure-reference.md) |
| Find example for use case                    | [examples-catalog](examples-catalog.md)                 |

## Skill Dependency Graph

```
                    platform-selection
                           │
              ┌────────────┼────────────┐
              ▼            │            ▼
    integration-adapters   │    smart-contract-patterns
              │            │            │
              └────────────┼────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  traceability-recall  selective-disclosure  mpc-secret-sharing
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            │            ▼
      hsm-key-management   │    post-quantum-crypto
                           │            │
                           │            ▼
                           │    p2mr-quantum-safe
                           │
                           ▼
                   examples-catalog
```

## Architecture Principles

All modules enforce:

- **Hexagonal Architecture**: Domain depends on port interfaces. Adapters implement ports. No direct SDK imports in domain.
- **Interface Segregation (ISP)**: Clients split into focused interfaces. Consumers depend only on required capabilities.
- **Dependency Inversion**: High-level modules depend on abstractions, not concrete implementations.
- **Clean Architecture**: Domain → Application → Infrastructure. Dependencies point inward only.

Layer responsibilities:

```
Domain Layer      → Entities, value objects, repository ports, domain services
Application Layer → Use case orchestration, depends on domain ports
Infrastructure    → SDK clients, database adapters, protocol adapters
```

## Skills Index

| Skill                                                 | Domain                                    | Key Modules                  |
| ----------------------------------------------------- | ----------------------------------------- | ---------------------------- |
| [platform-selection](platform-selection.md)           | Protocol selection                        | `modules/protocols/*`        |
| [integration-adapters](integration-adapters.md)       | SDK clients, retry, circuit breakers      | `modules/integrations/*`     |
| [smart-contract-patterns](smart-contract-patterns.md) | Solidity, Foundry, OpenZeppelin           | `contracts/solidity/*`       |
| [hsm-key-management](hsm-key-management.md)           | Hardware key storage, envelope encryption | `modules/hsm/*`              |
| [mpc-secret-sharing](mpc-secret-sharing.md)           | Additive shares, Shamir SSS               | `modules/mpc/*`              |
| [post-quantum-crypto](post-quantum-crypto.md)         | ML-KEM, ML-DSA, hash ladders              | `modules/mpc/src/quantum.ts` |
| [p2mr-quantum-safe](p2mr-quantum-safe.md)             | BIP-360 Merkle root outputs, ML-DSA-65    | `modules/p2mr/*`             |
| [selective-disclosure](selective-disclosure.md)       | Audience projection, audit proofs         | `modules/privacy/*`          |
| [traceability-recall](traceability-recall.md)         | Lot anchoring, recall assessment          | `modules/traceability/*`     |
| [examples-catalog](examples-catalog.md)               | 20 runnable examples                      | `examples/*`                 |

## Skill Structure

```
1. When to Use       — trigger conditions
2. When NOT to Use   — anti-patterns, wrong scenarios
3. Key Concepts      — domain terms, relationships
4. Architecture      — layers, ports, adapters
5. Implementation    — code structure, API surface
6. Must-Preserve     — invariants AI agents cannot violate
7. Anti-patterns     — common mistakes with explanations
8. References        — repo file paths
```

## Quality Standards

- Third-person voice: "Implements X" not "I help with X"
- Specific triggers: "Use when integrating Fabric Gateway SDK" not "Helps with Fabric"
- Explain trade-offs and decision criteria
- Document anti-patterns with rationale
- Under 2,000 words per skill
- Include must-preserve invariants for feature safety

## Commit Standards

- No AI co-author attributions (`Co-Authored-By: Claude`, `Co-Authored-By: Copilot`, etc.)
- No AI-generated badges or footers in commit messages
- No "Generated with" disclaimers
- Commits must read as if written by a human engineer
- Follow Conventional Commits format without AI tooling markers
