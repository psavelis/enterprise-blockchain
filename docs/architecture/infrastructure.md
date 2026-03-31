# Infrastructure Reference

Local development infrastructure for running blockchain nodes, observability services, and CI validation.

## Quick Start

```bash
# Start all services
make up

# Run smoke tests
make smoke

# View logs
make logs

# Stop services
make down
```

## Container Topology

The Docker Compose stack provisions three blockchain platforms plus observability:

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

## Security Hardening

The stack applies CIS Docker Benchmark controls:

- **Resource limits**: CPU/memory constraints on all containers prevent resource exhaustion
- **no-new-privileges**: Blocks privilege escalation attacks
- **Log rotation**: json-file driver with 10MB max, 3 file rotation prevents disk exhaustion
- **Network isolation**: All ports bound to 127.0.0.1

Configuration uses YAML anchors for consistency:

```yaml
x-security: &default-security
  security_opt:
    - no-new-privileges:true
  restart: unless-stopped

x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

## Makefile Targets

| Target                | Description                   |
| --------------------- | ----------------------------- |
| `make help`           | Show all available targets    |
| `make up`             | Start all blockchain services |
| `make down`           | Stop and remove containers    |
| `make smoke`          | Run smoke tests               |
| `make verify`         | Run full CI validation        |
| `make logs`           | Tail logs from all services   |
| `make ps`             | Show container status         |
| `make terraform-init` | Initialize Terraform          |
| `make terraform-plan` | Plan Terraform changes        |

## Telemetry Integration

Run examples with distributed tracing:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-service
npm run example:food-recall
```

Traces appear in Jaeger at http://localhost:16686. See [observability.md](observability.md) for instrumentation details.

## CI Workflows

| Workflow                  | Trigger                | Validation                               |
| ------------------------- | ---------------------- | ---------------------------------------- |
| `ci.yml`                  | Push/PR to main        | Format, lint, typecheck, tests, examples |
| `infra-smoke.yml`         | Docker Compose changes | Besu health, observability stack         |
| `infra-observability.yml` | Telemetry changes      | OTEL export, Jaeger traces               |
| `terraform.yml`           | Terraform changes      | Format, init, validate                   |

### Dependabot

Automated dependency updates:

- Weekly npm updates
- Weekly GitHub Actions updates
- Monthly Docker image updates
- Monthly Terraform provider updates

## Environment Configuration

Copy `.env.example` to `.env` for local customization:

```bash
# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=enterprise-blockchain

# Protocol endpoints
BESU_RPC_URL=http://localhost:8545
FABRIC_PEER_ENDPOINT=localhost:7051
CORDA_RPC_ENDPOINT=localhost:10007
```

## References

- [docker-compose.yml](../../docker-compose.yml)
- [Makefile](../../Makefile)
- [.env.example](../../.env.example)
- [infra/otel-collector-config.yaml](../../infra/otel-collector-config.yaml)
- [infra/prometheus.yaml](../../infra/prometheus.yaml)
- [skills/infrastructure-reference.md](../../skills/infrastructure-reference.md)
