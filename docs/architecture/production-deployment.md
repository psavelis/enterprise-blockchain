# Production Deployment Guide

Moving from examples to production blockchain infrastructure.

## Scope

This repository provides domain logic modules, protocol adapters, and cryptographic primitives. It does not include production-ready blockchain node deployment. This guide bridges the gap between running examples locally and deploying to production.

## Architecture Layers

Production deployment separates into independent layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Application Layer (this repository)                        │
│  - Domain modules (traceability, credentialing, privacy)    │
│  - Protocol adapters (Fabric, Besu, Corda projections)      │
│  - Cryptographic primitives (HSM, MPC, hybrid KEM)          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SDK Layer (external dependencies)                          │
│  - @hyperledger/fabric-gateway                              │
│  - ethers.js + Besu RPC                                     │
│  - Corda RPC client                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Infrastructure Layer (customer-managed)                    │
│  - Blockchain nodes (peers, validators, orderers)           │
│  - Certificate authorities                                  │
│  - HSM clusters                                             │
│  - Key management services                                  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites by Platform

### Hyperledger Fabric

| Requirement | Local Dev          | Production                        |
| ----------- | ------------------ | --------------------------------- |
| Peers       | 2 (Docker)         | 2+ per org (Kubernetes)           |
| Orderers    | 1 (Raft single)    | 5+ (Raft cluster, 3 orgs minimum) |
| CA          | Fabric CA (Docker) | Fabric CA + HSM or external PKI   |
| State DB    | LevelDB            | CouchDB cluster with replication  |
| TLS         | Self-signed        | CA-signed certificates            |
| Key storage | File-based         | HSM (PKCS#11)                     |

**Managed options**: IBM Blockchain Platform, AWS Managed Blockchain, Oracle Blockchain Platform.

### Hyperledger Besu

| Requirement | Local Dev      | Production                              |
| ----------- | -------------- | --------------------------------------- |
| Validators  | 4 (QBFT local) | 4+ across availability zones            |
| Consensus   | QBFT           | QBFT with validator rotation procedures |
| Privacy     | Tessera local  | Tessera cluster with database backend   |
| RPC         | HTTP exposed   | Load-balanced HTTPS with auth           |
| Key storage | Keystore file  | HashiCorp Vault or AWS KMS              |

**Managed options**: ConsenSys Quorum, AWS Managed Blockchain (Ethereum), Kaleido.

### R3 Corda

| Requirement | Local Dev             | Production                    |
| ----------- | --------------------- | ----------------------------- |
| Nodes       | Local deployNodes     | JVM-based deployment per org  |
| Notary      | Single non-validating | Notary cluster (Raft or BFT)  |
| Database    | H2 embedded           | PostgreSQL or SQL Server      |
| Network Map | Embedded              | Corda Network or private CENM |
| Key storage | JKS file              | HSM integration               |

**Managed options**: R3 Corda Network, Azure Blockchain Service (deprecated, migration required).

## Key Management

### HSM Integration

Production deployments require hardware security modules for key custody:

| Operation      | Local Dev      | Production                          |
| -------------- | -------------- | ----------------------------------- |
| Key generation | Software RNG   | HSM-generated (FIPS 140-2 Level 3+) |
| Signing        | In-memory keys | HSM-resident keys                   |
| Key backup     | File export    | HSM-to-HSM replication              |
| Access control | None           | Quorum-based (m-of-n)               |

This repository's HSM module (`modules/hsm`) provides a PKCS#11-compatible interface. Connect to production HSMs by configuring the PKCS#11 library path:

```typescript
import { HsmClient } from "@enterprise-blockchain/hsm";

const hsm = new HsmClient();
hsm.initialize({
  slotId: process.env.HSM_SLOT_ID,
  label: "production-kek",
  pkcs11Library: "/opt/cloudhsm/lib/libcloudhsm_pkcs11.so", // AWS CloudHSM
});
```

### Key Rotation

Production key management requires rotation procedures:

1. **Signing keys**: Rotate annually or after personnel changes
2. **KEKs**: Rotate on schedule (quarterly) and after suspected compromise
3. **TLS certificates**: Rotate before expiry (automated via cert-manager)
4. **Notary keys**: Rotate with planned downtime and member notification

## Observability

### Telemetry Stack

The local development stack uses:

- OpenTelemetry Collector → Jaeger (traces) + Prometheus (metrics)

Production equivalents:

| Local          | Production Options                               |
| -------------- | ------------------------------------------------ |
| Jaeger         | Datadog APM, Honeycomb, AWS X-Ray, Grafana Tempo |
| Prometheus     | Datadog Metrics, AWS CloudWatch, Grafana Cloud   |
| OTEL Collector | AWS Distro for OpenTelemetry, Datadog Agent      |

Configure via environment variables:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.prod.example.com:4318
export OTEL_SERVICE_NAME=blockchain-traceability-prod
export OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production
```

### Alerting

Recommended alerts for blockchain infrastructure:

| Alert                    | Condition                   | Severity |
| ------------------------ | --------------------------- | -------- |
| Block production stopped | No new blocks for 5 minutes | Critical |
| Peer disconnected        | Peer count below threshold  | Warning  |
| Transaction failures     | Error rate > 1%             | Warning  |
| HSM unavailable          | PKCS#11 connection failed   | Critical |
| Certificate expiry       | < 30 days remaining         | Warning  |

## Network Topology

### Multi-Region Deployment

Enterprise blockchain networks span multiple regions for resilience:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   us-east-1     │     │   eu-west-1     │     │   ap-south-1    │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │ Validator │◄─┼─────┼─►│ Validator │◄─┼─────┼─►│ Validator │  │
│  │   Node    │  │     │  │   Node    │  │     │  │   Node    │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
│                 │     │                 │     │                 │
│  ┌───────────┐  │     │  ┌───────────┐  │     │  ┌───────────┐  │
│  │   HSM     │  │     │  │   HSM     │  │     │  │   HSM     │  │
│  │  Cluster  │  │     │  │  Cluster  │  │     │  │  Cluster  │  │
│  └───────────┘  │     │  └───────────┘  │     │  └───────────┘  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Consensus algorithms tolerate regional failures:

- **QBFT/IBFT**: Requires 2/3+ validators online
- **Raft**: Requires majority (n/2+1) orderers online

### Network Security

| Layer     | Control                                    |
| --------- | ------------------------------------------ |
| Transport | mTLS between all nodes                     |
| Network   | Private subnets, no public IPs for nodes   |
| Firewall  | Allowlist peer IPs, deny all else          |
| DNS       | Private DNS zones for service discovery    |
| DDoS      | Cloud provider protection at load balancer |

## Disaster Recovery

### Backup Strategy

| Data            | Backup Frequency            | Retention      |
| --------------- | --------------------------- | -------------- |
| Ledger data     | Continuous (DB replication) | Indefinite     |
| State snapshots | Daily                       | 90 days        |
| Configuration   | On change (GitOps)          | Indefinite     |
| Keys (non-HSM)  | On generation               | Secure offline |

### Recovery Procedures

1. **Single node failure**: Automatic failover to remaining nodes
2. **Region failure**: Traffic shifts to surviving regions
3. **Total loss**: Restore from ledger backup, re-enroll identities
4. **Key compromise**: Revoke certificates, rotate keys, notify consortium

## Compliance Considerations

### Data Residency

Blockchain replication conflicts with data residency requirements. Mitigation patterns:

- **Channel isolation** (Fabric): Restrict data to region-specific channels
- **Privacy groups** (Besu): Keep regulated data in regional privacy groups
- **Need-to-know** (Corda): Natural fit—data only sent to required parties

### Audit Requirements

| Requirement           | Implementation                               |
| --------------------- | -------------------------------------------- |
| Immutable audit trail | Blockchain ledger (inherent)                 |
| Access logging        | Application-level audit events + OTEL traces |
| Key usage audit       | HSM audit logs + blockchain anchor           |
| Retention periods     | Off-chain archive with Merkle root anchoring |

## Checklist: Production Readiness

Before deploying to production:

- [ ] HSM integration tested with production HSM vendor
- [ ] Certificate lifecycle automation (issuance, renewal, revocation)
- [ ] Multi-region node deployment with consensus quorum preserved
- [ ] Backup and restore procedures tested
- [ ] Monitoring and alerting configured
- [ ] Incident response runbook documented
- [ ] Key rotation procedures tested
- [ ] Performance testing at expected transaction volume
- [ ] Security audit completed (smart contracts + infrastructure)
- [ ] Disaster recovery drill completed

## References

- [infrastructure.md](infrastructure.md) — Local development infrastructure
- [observability.md](observability.md) — OpenTelemetry integration
- [hsm-integration-patterns.md](hsm-integration-patterns.md) — PKCS#11 mapping
- [Fabric Operations Guide](https://hyperledger-fabric.readthedocs.io/en/latest/operations_guide.html)
- [Besu Private Networks](https://besu.hyperledger.org/private-networks)
- [Corda Enterprise Deployment](https://docs.r3.com/en/platform/corda/4.12/enterprise/operations/deployment.html)
