# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Hexagonal architecture across all domain modules (traceability, privacy, credentialing, aid-settlement, HSM).
- Port interfaces for protocol adapters (traceability, privacy, credentialing).
- Design for multi-platform smart contracts (Solidity, Fabric TypeScript chaincode, Corda Kotlin).
- Expanded test coverage beyond the initial 81 tests.
- Cross-module e2e test.
- Governance documents: LICENSE (Apache 2.0), CONTRIBUTING.md, SECURITY.md, CHANGELOG.md.
- Documentation restructure: `docs/architecture/modules.md`, `docs/examples.md`, `contracts/README.md`, `infra/README.md`.
- Edge-case tests: zero-budget grant overspend, credential expiry boundary (validUntil === scheduledAt).
- Terraform health checks, Docker volumes, memory limits, and sensitive variable support.
- NIST/RFC reference URLs in crypto-related code comments (SP 800-38D, RFC 5869).

### Changed

- HSM module split into `AsymmetricKeyService`, `SymmetricKeyService`, `EnvelopeEncryptionService` (SRP).
- `AidSettlementLedger.reconcile()` decomposed into focused validation methods.
- Protocol adapters implement typed port interfaces.
- All module facades accept dependency injection via options objects (`{ store?, logger? }`).
- `README.md` slimmed to link to `docs/` folder for detailed content.
- `CONTRIBUTING.md` expanded with Solidity/Foundry, Docker, and Terraform setup sections.

## [0.1.0] - 2026-03-26

### Added

- Initial repository with 9 domain modules, 19 runnable examples, and protocol adapters for Fabric, Besu, and Corda.
- MPC engine with additive secret sharing and quantum-resistant vault with Shamir threshold sharing.
- HSM client for EC P-256 signing, AES-256-GCM envelope encryption, and key wrapping.
- ML-KEM (FIPS 203) and hybrid KEM key exchange with ML-DSA (FIPS 204) signatures.
- Integration sketches for Fabric Gateway, Besu ethers, and Corda REST.
- GitHub Actions CI with 4-job matrix.
- 81 passing tests.
