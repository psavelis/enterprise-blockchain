# Contributing

Contributions are welcome. This guide covers setup, conventions, and the review process.

## Development Setup

```bash
git clone https://github.com/psavelis/enterprise-blockchain.git
cd enterprise-blockchain
npm install
npm run verify        # format + lint + typecheck + test + examples
```

**Requirements:** Node.js ≥ 22.13.0, npm ≥ 10.

## Branch Naming

| Type     | Pattern                   | Example                           |
| -------- | ------------------------- | --------------------------------- |
| Feature  | `feature/<scope>`         | `feature/smart-contracts`         |
| Refactor | `refactor/<scope>`        | `refactor/hexagonal-architecture` |
| Bug fix  | `fix/<short-description>` | `fix/recall-assessment-edge`      |
| Tests    | `test/<scope>`            | `test/coverage-expansion`         |
| Docs     | `docs/<scope>`            | `docs/restructure`                |
| Infra    | `infra/<scope>`           | `infra/terraform`                 |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): short description

Optional body with context.
```

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf`.

**Scope examples:** `traceability`, `privacy`, `hsm`, `contracts`, `infra`.

## Pull Request Process

1. One concern per PR. Keep changes focused and independently mergeable.
2. All CI checks must pass: format, lint, typecheck, Node.js tests, examples.
3. Include a brief description of _what_ changed and _why_.
4. Link related issues if applicable.
5. Request review from at least one maintainer.

## Code Review Standards

- Verify the change works (run `npm run verify` locally).
- Check for regressions in related modules.
- Ensure new code follows existing patterns (hexagonal architecture, port/adapter boundaries).
- No unused imports, no dead code, no commented-out blocks.
- Tests are required for all new behavior.

## Testing Requirements

- Run `npm run test` before pushing. All tests must pass.
- New domain logic requires unit tests.
- Cross-module behavior requires integration or e2e tests.
- Smart contracts require Foundry tests (run `forge test` in the contracts project directory).

## Architecture

The repository follows hexagonal architecture principles:

- **Domain:** Entities, value objects, business rules. No framework imports.
- **Application:** Use cases and services. Depend on domain ports.
- **Infrastructure:** Adapters (in-memory stores, protocol clients). Implement domain ports.
- **Facade:** Module entry point (`index.ts`) re-exports the public API.

Protocol adapters under `modules/protocols/` implement port interfaces and produce platform-specific transaction shapes without requiring a live network.

## Style

- TypeScript strict mode.
- Prettier for formatting, ESLint for linting.
- No AI-generated language patterns in comments or documentation.
- Keep functions focused. Prefer small, composable units.
