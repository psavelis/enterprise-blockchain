# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Hexagonal architecture across all domain modules (traceability, privacy, credentialing, aid-settlement, HSM).
- Shared primitives module (`Store<K,V>`, `daysUntil()`, `commitShare()`).
- Port interfaces for protocol adapters (traceability, privacy, credentialing).
- Smart contracts for three platforms:
  - Solidity: `TraceabilityAnchor`, `AidSettlement`, `ConsortiumOrderRegistry` with Foundry test suites.
  - Fabric: `FoodTraceContract` TypeScript chaincode.
  - Corda: `ProviderClearanceContract`, `ProviderClearanceState`, `ProviderClearanceFlow` (Kotlin).
- Expanded test coverage from 81 to 99+ tests.
- Cross-module e2e test.
- Governance documents: LICENSE (Apache 2.0), CONTRIBUTING.md, SECURITY.md, CHANGELOG.md.

### Changed

- HSM module split into `AsymmetricKeyService`, `SymmetricKeyService`, `EnvelopeEncryptionService` (SRP).
- `AidSettlementLedger.reconcile()` decomposed into focused validation methods.
- Protocol adapters implement typed port interfaces.

## [0.1.0] - 2026-03-26

### Added

- Initial repository with 9 domain modules, 19 runnable examples, and protocol adapters for Fabric, Besu, and Corda.
- MPC engine with additive secret sharing and quantum-resistant vault with Shamir threshold sharing.
- HSM client for EC P-256 signing, AES-256-GCM envelope encryption, and key wrapping.
- ML-KEM (FIPS 203) and hybrid KEM key exchange with ML-DSA (FIPS 204) signatures.
- Integration sketches for Fabric Gateway, Besu ethers, and Corda REST.
- GitHub Actions CI with 4-job matrix.
- 81 passing tests.
