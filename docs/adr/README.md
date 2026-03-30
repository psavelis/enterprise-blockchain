# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) documenting significant technical decisions made in this project.

## Index

| ADR                                              | Title                           | Status   |
| ------------------------------------------------ | ------------------------------- | -------- |
| [ADR-0001](ADR-0001-hexagonal-architecture.md)   | Hexagonal Architecture with DDD | Accepted |
| [ADR-0002](ADR-0002-protocol-adapter-pattern.md) | Protocol Adapter Pattern        | Accepted |
| [ADR-0003](ADR-0003-hybrid-kem-design.md)        | Hybrid KEM for Post-Quantum     | Accepted |
| [ADR-0004](ADR-0004-field-arithmetic-for-mpc.md) | Field Arithmetic for MPC        | Accepted |

## Template

New ADRs should follow the [Nygard template](https://github.com/joelparkerhenderson/architecture-decision-record/tree/main/locales/en/templates/decision-record-template-by-michael-nygard):

```markdown
# ADR-XXXX: Title

## Status

Proposed | Accepted | Deprecated | Superseded by ADR-YYYY

## Context

What is the issue that we're seeing that motivates this decision?

## Decision

What is the change that we're proposing?

## Consequences

What are the positive and negative results of this decision?
```

## Naming Convention

- `ADR-XXXX-short-description.md`
- Four-digit number, zero-padded
- Lowercase with hyphens
