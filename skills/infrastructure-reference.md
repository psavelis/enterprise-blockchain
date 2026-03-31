# Infrastructure Reference

Structured knowledge for deploying and operating enterprise blockchain infrastructure locally and in CI/CD pipelines.

## When to Use

- Setting up local development environment for blockchain integration
- Configuring Docker Compose for multi-platform blockchain networks
- Adding observability (tracing, metrics) to blockchain applications
- Running infrastructure smoke tests in CI
- Applying security hardening to container deployments

## When NOT to Use

- Cloud-native Kubernetes deployments (use dedicated K8s skills)
- Production HSM integration (see [hsm-key-management.md](hsm-key-management.md))
- Smart contract deployment logic (see [smart-contract-patterns.md](smart-contract-patterns.md))

## Key Concepts

### Container Topology

The reference stack provisions three blockchain platforms:

| Platform | Containers           | Ports       | Protocol           |
| -------- | -------------------- | ----------- | ------------------ |
| Besu     | 2 validator nodes    | 8545, 8546  | JSON-RPC over HTTP |
| Fabric   | 1 orderer + 2 peers  | 7050-7052   | gRPC               |
| Corda    | 1 notary + 2 parties | 10006-10008 | RPC                |

### Observability Stack

| Service        | Port  | Purpose             |
| -------------- | ----- | ------------------- |
| OTEL Collector | 4318  | OTLP HTTP receiver  |
| Jaeger         | 16686 | Trace visualization |
| Prometheus     | 9090  | Metrics collection  |

### Security Hardening (CIS Docker Benchmark)

- **Resource limits**: CPU/memory constraints prevent resource exhaustion
- **no-new-privileges**: Blocks privilege escalation attacks
- **Logging rotation**: json-file driver with 10MB max, 3 file rotation
- **Network isolation**: All ports bound to 127.0.0.1

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Besu Network   │  Fabric Network │     Corda Network           │
│  ┌───────────┐  │  ┌───────────┐  │  ┌───────────┐              │
│  │validator-0│  │  │  orderer  │  │  │  notary   │              │
│  │  :8545    │  │  │  :7050    │  │  │  :10006   │              │
│  └───────────┘  │  └───────────┘  │  └───────────┘              │
│  ┌───────────┐  │  ┌───────────┐  │  ┌───────────┬───────────┐  │
│  │validator-1│  │  │ peer-org1 │  │  │  partyA   │  partyB   │  │
│  │  :8546    │  │  │  :7051    │  │  │  :10007   │  :10008   │  │
│  └───────────┘  │  └───────────┘  │  └───────────┴───────────┘  │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                   Observability Stack                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐                    │
│  │otel-coll. │──│  jaeger   │  │prometheus │                    │
│  │  :4318    │  │  :16686   │  │  :9090    │                    │
│  └───────────┘  └───────────┘  └───────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation

### Quick Start

```bash
# Start all services
make up

# Or using docker compose directly
docker compose up -d

# Run smoke tests
make smoke

# View logs
make logs
```

### Environment Variables for Telemetry

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-service
npm run example:food-recall
```

### Makefile Targets

| Target        | Description                   |
| ------------- | ----------------------------- |
| `make help`   | Show all available targets    |
| `make up`     | Start all blockchain services |
| `make down`   | Stop and remove containers    |
| `make smoke`  | Run smoke tests               |
| `make verify` | Run full CI validation        |
| `make logs`   | Tail logs from all services   |

### CI Validation

The repository includes CI workflows for:

1. **Core validation**: Format, lint, typecheck, tests, examples
2. **Observability validation**: Docker compose health checks, telemetry export
3. **Terraform validation**: Format check, init, validate

## Must-Preserve Invariants

1. **All ports bind to 127.0.0.1** — never expose blockchain nodes externally in local dev
2. **Resource limits on all containers** — prevents OOM kills and resource starvation
3. **Health checks on all services** — enables proper orchestration and smoke testing
4. **YAML anchors for DRY config** — security and logging settings must be consistent
5. **CI must validate compose syntax** — breaking changes caught before merge

## Anti-patterns

| Anti-pattern                  | Why It's Wrong                         | Correct Approach                    |
| ----------------------------- | -------------------------------------- | ----------------------------------- |
| Exposing ports on 0.0.0.0     | Allows external access to dev services | Bind to 127.0.0.1                   |
| No resource limits            | Containers can exhaust host resources  | Set CPU/memory limits               |
| Using `latest` image tags     | Non-reproducible builds                | Pin specific versions               |
| Skipping health checks        | No visibility into service readiness   | Define healthcheck for all services |
| Hardcoding secrets in compose | Security vulnerability                 | Use environment variables or files  |
| Running containers as root    | Privilege escalation risk              | Use no-new-privileges               |

## References

### Repository Paths

- Docker Compose: [docker-compose.yml](../docker-compose.yml)
- Terraform modules: [infra/](../infra/)
- Observability docs: [docs/architecture/observability.md](../docs/architecture/observability.md)
- Smoke test script: [scripts/smoke-test-local.sh](../scripts/smoke-test-local.sh)
- OTEL Collector config: [infra/otel-collector-config.yaml](../infra/otel-collector-config.yaml)

### Official Documentation

- [Docker Compose](https://docs.docker.com/compose/)
- [CIS Docker Benchmark](https://www.cisecurity.org/benchmark/docker)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Jaeger](https://www.jaegertracing.io/docs/)
- [Prometheus](https://prometheus.io/docs/)
- [Terraform](https://developer.hashicorp.com/terraform/docs)
- [Hyperledger Besu](https://besu.hyperledger.org/en/stable/)
- [Hyperledger Fabric](https://hyperledger-fabric.readthedocs.io/)
- [Corda](https://docs.r3.com/en/platform/corda/)
