# AI Skills

This directory contains structured knowledge files designed for AI agents and coding assistants. Each skill covers a domain pattern from the repository with enough context for an agent to reason about design decisions, generate code, or answer architectural questions.

## Skills

| Skill                                                    | Domain                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| [platform-selection.md](platform-selection.md)           | Choosing between Besu, Fabric, and Corda for a given use case             |
| [selective-disclosure.md](selective-disclosure.md)       | Audience-based field projection and signed audit proofs                   |
| [hsm-key-management.md](hsm-key-management.md)           | HSM patterns: asymmetric signing, envelope encryption, key ceremonies     |
| [mpc-secret-sharing.md](mpc-secret-sharing.md)           | Additive secret sharing, commitment verification, threshold authorization |
| [traceability-recall.md](traceability-recall.md)         | Food-lot anchoring, shipment tracking, recall assessment                  |
| [integration-adapters.md](integration-adapters.md)       | Protocol adapters, retry/circuit-breaker, gas/nonce management            |
| [smart-contract-patterns.md](smart-contract-patterns.md) | AccessControl, Pausable, UUPS upgrades, invariant testing                 |

## Usage

AI agents can read these files to gain domain-specific context before generating code or answering questions about enterprise blockchain patterns. Each file is self-contained and follows a consistent structure:

1. **When to use** — problem description and trigger conditions
2. **Key concepts** — domain terms and relationships
3. **Implementation pattern** — code structure and API surface
4. **Pitfalls** — common mistakes and how to avoid them
5. **References** — pointers to relevant repo files
