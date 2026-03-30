# Examples Catalog

Comprehensive index of all runnable examples with module dependencies and key APIs.

## When to Use

- Finding reference implementation for a specific use case
- Understanding how modules compose for end-to-end workflows
- Validating that refactoring preserves example functionality
- Learning API usage patterns before implementing new features

## When NOT to Use

- Production deployment (examples use in-memory stores)
- Performance benchmarking (examples prioritize clarity over optimization)
- Security testing (examples skip HSM initialization in dev mode)

## Examples by Domain

### HSM & Key Management

| Example                   | Purpose                                                    | Key Modules                                                          | Must-Preserve                                                      |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `hsm-transaction-signing` | Sign blockchain transactions with HSM-backed keys          | `HsmClient.sign()`, `HsmClient.verify()`                             | Signing requires `initialize()` first; verify round-trips          |
| `hsm-key-ceremony`        | Multi-custodian key initialization with threshold recovery | `HsmClient`, `QuantumResistantVault.distributeSecret()`              | k-of-n threshold reconstruction; audit log captures all operations |
| `hsm-envelope-encryption` | Encrypt sensitive data with DEK/KEK hierarchy              | `HsmClient.encryptWithEnvelope()`, `HsmClient.decryptWithEnvelope()` | Wrapped DEK stored with ciphertext; KEK never exported             |

### MPC & Secret Sharing

| Example                         | Purpose                                                          | Key Modules                                                                            | Must-Preserve                                                 |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `mpc-sealed-bid-auction`        | Sealed-bid auction with hidden bids until reveal                 | `MPCEngine.splitSecret()`, `MPCEngine.compute('sum')`                                  | Commitment verification before compute; no bid revealed early |
| `mpc-joint-risk-analysis`       | Aggregate risk scores across competitors without exposing inputs | `MPCEngine.registerParty()`, `MPCEngine.compute('threshold')`                          | Threshold check without revealing individual values           |
| `quantum-resistant-key-sharing` | Shamir SSS with hash-ladder anchoring                            | `QuantumResistantVault.distributeSecret()`, `QuantumResistantVault.createHashLadder()` | Reconstruction returns null if threshold not met              |

### Privacy & Selective Disclosure

| Example                          | Purpose                                                                | Key Modules                                                     | Must-Preserve                                                         |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `consortium-order-sharing`       | Share order data with different audiences (logistics, bank, regulator) | `ViewProjector.createView()`, `OrderRepository`                 | Audit proof binds projection to source; HSM signature when configured |
| `digital-credentials-issuance`   | Issue W3C Verifiable Credentials with HSM signing                      | `CredentialIssuer.issueCredential()`, `HsmClient.sign()`        | Credential includes issuer, subject, claims; signature required       |
| `credential-revocation-registry` | Manage credential lifecycle with revocation lists                      | `RevocationRegistry.revoke()`, `RevocationRegistry.isRevoked()` | Revoked credentials return true; irreversible                         |
| `selective-attribute-disclosure` | Reveal subset of credential attributes per verifier                    | `AttributeProjector.project()`                                  | Hidden attributes not in output; audit hash covers full credential    |

### Supply Chain & Traceability

| Example                          | Purpose                                                | Key Modules                                         | Must-Preserve                                                   |
| -------------------------------- | ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| `food-recall-response`           | Assess contamination scope and generate recall notices | `RecallAssessor.assess()`, `TraceabilityRepository` | Recall includes impacted lots, shipments, destinations, reasons |
| `fabric-traceability-projection` | Project shipment data from Fabric ledger               | `FabricAdapter`, `TraceabilityRepository`           | Telemetry readings preserved; breach thresholds respected       |

### Protocol Adapters & Integration

| Example                       | Purpose                                      | Key Modules                                                | Must-Preserve                                              |
| ----------------------------- | -------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------- |
| `besu-order-anchoring`        | Anchor order hash to Besu with privacy group | `BesuAdapter.anchorOrder()`, `IBesuTransactionBuilder`     | Gas estimation before submit; nonce management             |
| `fabric-chaincode-invocation` | Submit transactions via Fabric Gateway SDK   | `FabricAdapter.recordShipment()`, `IFabricProposalBuilder` | Endorsement policy satisfied; transient data as Uint8Array |
| `corda-clearance-flow`        | Issue regulatory clearances via Corda REST   | `CordaAdapter.issueClearance()`, `ICordaFlowInvoker`       | Flow sessions bilateral; notary prevents double-spend      |
| `multi-chain-settlement`      | Cross-chain settlement with oracle anchoring | `BesuAdapter`, `FabricAdapter`, `TraceabilityAnchor.sol`   | Oracle signature verified; lot hash matches                |

### Smart Contracts

| Example                      | Purpose                                              | Key Modules                                      | Must-Preserve                                                     |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `aid-settlement-workflow`    | Humanitarian aid disbursement with role-based access | `AidSettlement.sol`, `AccessControl`, `Pausable` | Zero-address admin reverts; pause blocks state changes            |
| `upgradeable-aid-settlement` | UUPS proxy upgrade pattern                           | `AidSettlementUpgradeable.sol`, `ERC1967Proxy`   | `_disableInitializers()` in constructor; `onlyOwner` upgrade auth |

## Module Dependency Matrix

```
Example                          HSM  MPC  Privacy  Trace  Besu  Fabric  Corda
─────────────────────────────────────────────────────────────────────────────
hsm-transaction-signing           ●                        ●
hsm-key-ceremony                  ●    ●
hsm-envelope-encryption           ●
mpc-sealed-bid-auction                 ●
mpc-joint-risk-analysis                ●
quantum-resistant-key-sharing          ●
consortium-order-sharing          ●         ●              ●
digital-credentials-issuance      ●         ●
credential-revocation-registry              ●
selective-attribute-disclosure              ●
food-recall-response                             ●
fabric-traceability-projection                   ●               ●
besu-order-anchoring                                       ●
fabric-chaincode-invocation                                      ●
corda-clearance-flow                                                   ●
multi-chain-settlement                           ●         ●     ●
aid-settlement-workflow                                    ●
upgradeable-aid-settlement                                 ●
```

## Running Examples

```bash
# All examples
npx tsx examples/<name>/index.ts

# With environment configuration
BESU_RPC_URL=http://localhost:8545 npx tsx examples/besu-order-anchoring/index.ts
FABRIC_GATEWAY_ENDPOINT=localhost:7051 npx tsx examples/fabric-chaincode-invocation/index.ts
CORDA_REST_ENDPOINT=https://localhost:10006 npx tsx examples/corda-clearance-flow/index.ts
```

## Must-Preserve Invariants

When modifying any example:

1. **Initialization order**: HSM examples call `initialize()` before any crypto operation
2. **Commitment verification**: MPC examples verify commitments before `compute()`
3. **Audit proof binding**: Privacy examples generate audit hash covering full source data
4. **Retry policy application**: Integration examples use `withRetry()` for all SDK calls
5. **Type safety**: All examples use typed entities from domain modules, not raw objects
6. **Error handling**: SDK errors mapped to domain errors via `error-mapper.ts`

## Anti-patterns

**Removing initialization**: HSM and MPC examples require explicit setup. Skipping initialization causes runtime errors or security holes.

**Hardcoding credentials**: Examples load config from environment. Never commit credentials to example code.

**Skipping retry logic**: Integration examples demonstrate production patterns. Removing retry/circuit breaker loses resilience features.

**Changing output format**: Example output is documentation. Maintain console.log structure for reproducibility.

## References

- `examples/*/index.ts` — All example entry points
- `tests/*.test.ts` — Tests validating example patterns
- `docs/architecture/example-patterns.md` — Design rationale
