<p align="center">
  <img src="enterprise-blockchain-repo-logo.jpg" alt="Enterprise Blockchain" width="100%" />
</p>

# Enterprise Blockchain Case Studies

[![CI](https://github.com/psavelis/enterprise-blockchain/actions/workflows/ci.yml/badge.svg)](https://github.com/psavelis/enterprise-blockchain/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Node.js](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen)

TypeScript repository for enterprise blockchain case studies, protocol mappings, and integration patterns.

The repository is organized around reusable domain modules and runnable examples. The focus is operational design: traceability, selective disclosure, credential verification, and reconciliation.

## Repository Layout

- `modules/`: Reusable TypeScript modules that model enterprise blockchain capabilities.
- `examples/`: Runnable case studies, one folder per scenario.
- `docs/`: Research material, presentation assets, and supporting documentation.
- `scripts/`: Utility entrypoints for repository workflows.
- `skills/`: AI skill files for coding assistants and agents — structured knowledge covering platform selection, privacy patterns, HSM, MPC, traceability, integration adapters, and smart contract patterns.

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

## HSM Key Management Examples

Three examples show hardware security module patterns for production blockchain deployments.

1. `hsm-transaction-signing`: EC P-256 key generation and ECDSA-SHA256 signing of equity trade orders (Apex Capital scenario).
2. `hsm-key-ceremony`: Root key ceremony combining HSM signing with 3-of-5 Shamir threshold custodianship (GlobalNet consortium).
3. `hsm-envelope-encryption`: DEK/KEK envelope encryption for sensitive trade documents stored on a shared ledger (TradeFin platform).

## Post-Quantum Cryptography Examples

Three examples demonstrate NIST-standardized post-quantum algorithms (FIPS 203/204).

1. `kyber-kem-key-exchange`: ML-KEM-768 key encapsulation for quantum-resistant key establishment.
2. `hybrid-kem-settlement`: X25519 + ML-KEM-768 hybrid KEM for defense-in-depth key exchange.
3. `quantum-safe-payment`: End-to-end quantum-safe payment flow using hybrid KEM and ML-DSA-65 signatures.

## Quick Start

```bash
# Clone with submodules (required for Foundry contracts)
git clone --recursive https://github.com/psavelis/enterprise-blockchain.git
cd enterprise-blockchain

# Or if already cloned without --recursive:
git submodule update --init --recursive

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
npm run example:hsm-tx-signing
npm run example:hsm-key-ceremony
npm run example:hsm-envelope-encryption
npm run example:kyber-kem
npm run example:hybrid-kem
npm run example:quantum-safe-payment
```

## Design Goals

- Keep the examples close to operational problems faced by consortiums, regulators, and platform teams.
- Show where blockchain changes system behavior: auditability, provenance, privacy boundaries, and cross-organization coordination.
- Keep the repository small enough to study and structured enough to present.

## Protocol Adapters

<p align="center">
  <img src="big-picture-architecture.png" alt="Enterprise Blockchain - Big Picture" width="100%" />
</p>

The repository includes protocol adapters that map domain events into platform-specific transaction shapes.

- `modules/protocols/fabric/`: Chaincode-style command generation for endorsement-driven workflows.
- `modules/protocols/besu/`: EVM/Besu-style contract call generation for consortium deployments.
- `modules/protocols/corda/`: State-and-flow style command generation for point-to-point regulated workflows.

These modules model protocol semantics. They are not full application runtimes.

## MPC Module

- `modules/mpc/`: `MPCEngine` (additive secret sharing) and `QuantumResistantVault` (Shamir threshold sharing, hash-ladder anchoring). MPC operates off-chain; results can be anchored on-chain via the Besu adapter's `anchorOrder` pattern, or via a custom transaction in a Fabric chaincode.

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

### Purpose

Enterprise blockchain systems demand correctness guarantees that exceed typical application standards. Cryptographic operations (MPC additive shares, Shamir threshold reconstruction, ML-KEM encapsulation, ML-DSA signing) produce silent failures when implemented incorrectly—no runtime exception, just compromised security. Protocol adapters must generate transaction shapes that precisely match Fabric chaincode, Besu contract ABIs, and Corda flow expectations. Hexagonal architecture boundaries prevent infrastructure concerns from leaking into domain logic, preserving testability and protocol portability. These quality gates enforce reproducibility across every example, maintain architectural invariants, and catch regressions before they reach any environment.

### Local Verification Command

Run the full quality gate locally before committing:

```bash
npm run verify
```

This aliases `npm run ci:core`, which executes five sequential checks:

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test && npm run examples
```

| Step | Script         | Tool                          | Description                                                                                            |
| ---- | -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1    | `format:check` | Prettier                      | Validates consistent formatting across all source files                                                |
| 2    | `lint`         | ESLint + typescript-eslint    | Static analysis on `modules/`, `examples/`, `scripts/`, `tests/` with `--max-warnings=0`               |
| 3    | `typecheck`    | `tsc --noEmit`                | TypeScript strict mode validation (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| 4    | `test`         | Node.js native test runner    | Executes `node --import tsx --test tests/**/*.test.ts`                                                 |
| 5    | `examples`     | `scripts/run-all-examples.ts` | Runs every case study, protocol projection, MPC, HSM, and PQC demonstration                            |

All five checks must pass. Any failure blocks the pipeline.

### CI/CD Enforcement

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to `main`/`master` and every pull request. It executes four parallel matrix jobs:

- **Core validation** (`npm run ci:core`): Format, lint, typecheck, tests, primary examples
- **Protocol projections** (`npm run ci:protocol-projections`): Fabric, Besu, Corda projection entrypoints
- **Demo scripts** (`npm run ci:demos`): Adapter and integration client demonstrations
- **Integration examples** (`npm run ci:integration-examples`): Fabric Gateway, Besu ethers, Corda REST sketches

CI uses Node.js 22.13.0 with `npm ci` for deterministic installs. PRs receive automated status comments summarizing suite results. The `npm run verify` command is the single source of truth—passing locally guarantees CI success.

### Detailed Quality Criteria

- **Formatting & style**: Prettier enforces consistent whitespace, trailing commas, and quote style across TypeScript, JSON, and markdown
- **Linting**: ESLint with `typescript-eslint/recommendedTypeChecked` catches type-aware issues; zero warnings tolerated
- **Type safety**: TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` prevents null/undefined surprises
- **Testing**: Node.js native test runner validates domain logic, application services, and cross-module interactions
- **Example execution**: Every demonstration script must run to completion without error, proving each pattern remains functional
- **Architectural compliance**: Domain layers import no infrastructure; adapters implement ports without leaking protocol details; no circular dependencies
- **Contribution hygiene**: Conventional Commits required; PRs address single concerns; no dead code, unused imports, or commented blocks

### Blockchain-Specific Gates

These gates exist because blockchain bugs are expensive and often irreversible:

- **MPC correctness**: Additive secret sharing and Shamir reconstruction rely on precise field arithmetic—off-by-one errors silently corrupt computations
- **Protocol fidelity**: Fabric endorsement policies, Besu gas estimation, and Corda flow serialization require exact transaction shapes; malformed payloads fail at network boundaries
- **Quantum-resistance invariants**: ML-KEM and ML-DSA implementations must preserve ciphertext/signature lengths and decapsulation semantics across refactors
- **Selective disclosure properties**: Audience projections and audit proof hashes must remain deterministic; any drift breaks cross-party verification
- **Traceability chain integrity**: Lot anchoring and recall assessment depend on consistent hashing—corrupted state roots propagate through supply chain queries

### How to Use

1. **Before committing**: Run `npm run verify` locally. All five checks must pass.
2. **On failure**: Fix the issue, re-run `npm run verify`. Do not push failing code.
3. **Before opening PR**: Confirm `npm run verify` passes. CI will re-validate independently.
4. **During review**: Reviewers run `npm run verify` to confirm changes integrate cleanly.

Environment templates for the integration examples live under `examples/config/`. The Besu integration uses a contract ABI under `contracts/` (e.g., `ConsortiumOrderRegistry.sol` and its JSON ABI).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, branch naming, commit conventions, and pull request guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
