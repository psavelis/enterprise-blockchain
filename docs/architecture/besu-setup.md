# Besu Local Development Setup

This guide covers setting up Hyperledger Besu validators for local development and testing.

## Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine (Linux)
- Node.js 22.14.0 or later
- npm

## Quick Start

Start both Besu validators:

```bash
docker compose up -d besu-validator-0 besu-validator-1
```

Wait for health checks to pass (approximately 15-30 seconds):

```bash
docker compose ps
```

Verify JSON-RPC is responding:

```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

Expected response:

```json
{ "jsonrpc": "2.0", "id": 1, "result": "0x1a" }
```

## Configuration Reference

### Service Overview

| Service          | Port | Chain ID | Purpose                   |
| ---------------- | ---- | -------- | ------------------------- |
| besu-validator-0 | 8545 | 1337     | Primary JSON-RPC endpoint |
| besu-validator-1 | 8546 | 1337     | Secondary validator node  |

### Docker Image

```yaml
image: hyperledger/besu:24.12.2
```

The repository uses Besu 24.12.2, a stable LTS release with full EVM compatibility.

### Network Mode

```yaml
command:
  - --network=dev
```

Dev network mode provides:

- Automatic block production (~1 second intervals)
- Pre-funded development accounts
- No consensus overhead (single-node mining)
- Chain ID 1337

### JSON-RPC Configuration

```yaml
command:
  - --rpc-http-enabled
  - --rpc-http-host=0.0.0.0
  - --rpc-http-cors-origins=http://localhost
  - --host-allowlist=localhost,127.0.0.1
```

| Flag                      | Value                 | Purpose                               |
| ------------------------- | --------------------- | ------------------------------------- |
| `--rpc-http-enabled`      | (flag)                | Enable HTTP JSON-RPC server           |
| `--rpc-http-host`         | `0.0.0.0`             | Bind to all container interfaces      |
| `--rpc-http-cors-origins` | `http://localhost`    | Allow browser requests from localhost |
| `--host-allowlist`        | `localhost,127.0.0.1` | Restrict host header values           |

### Mining Configuration

```yaml
command:
  - --miner-enabled
  - --miner-coinbase=0x0000000000000000000000000000000000000000
```

| Flag               | Purpose                            |
| ------------------ | ---------------------------------- |
| `--miner-enabled`  | Enable block production            |
| `--miner-coinbase` | Address receiving transaction fees |

Validator-0 uses coinbase `0x...0000`, validator-1 uses `0x...0001`.

### Health Checks

```yaml
healthcheck:
  test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/localhost/8545'"]
  interval: 10s
  timeout: 5s
  retries: 10
  start_period: 15s
```

The health check opens a TCP connection to the RPC port. This approach:

- Works without curl/wget in the container
- Detects if the RPC server is accepting connections
- Allows 15 seconds for initial startup

### Resource Limits

```yaml
deploy:
  resources:
    limits:
      cpus: "1.0"
      memory: 1G
    reservations:
      cpus: "0.25"
      memory: 256M
```

| Resource | Limit | Reservation | Notes                             |
| -------- | ----- | ----------- | --------------------------------- |
| CPU      | 1.0   | 0.25        | Single core max, quarter reserved |
| Memory   | 1G    | 256M        | Sufficient for dev workloads      |

### Security Hardening

```yaml
security_opt:
  - no-new-privileges:true
restart: unless-stopped
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

| Setting                   | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `no-new-privileges`       | Prevent privilege escalation in container |
| `restart: unless-stopped` | Auto-restart on crash                     |
| Log rotation              | 10MB max per file, 3 files retained       |

## Common Operations

### Check Block Production

```bash
# Get current block number
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  | jq -r '.result' | xargs printf "%d\n"
```

### Get Chain ID

```bash
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  | jq -r '.result' | xargs printf "%d\n"
# Output: 1337
```

### Check Node Sync Status

```bash
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_syncing","params":[],"id":1}'
# Output: {"jsonrpc":"2.0","id":1,"result":false}
# (false means not syncing, i.e., fully synced)
```

### List Pre-funded Accounts

```bash
curl -s -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_accounts","params":[],"id":1}'
```

### View Container Logs

```bash
docker logs besu-validator-0 --tail 50 -f
```

## Running E2E Tests

The repository includes end-to-end tests that run against live Besu nodes:

```bash
# Start Besu validators
docker compose up -d besu-validator-0 besu-validator-1

# Wait for health checks
sleep 20

# Run E2E tests
npm run test:e2e
```

E2E tests cover:

- Node health and connectivity
- Block production verification
- JSON-RPC API functionality
- Cross-node consistency

## Troubleshooting

### Health Check Failing

**Symptom**: `docker compose ps` shows unhealthy status

**Solutions**:

1. Wait longer for startup (up to 30 seconds on slower machines)
2. Check container logs: `docker logs besu-validator-0`
3. Verify port is not in use: `lsof -i :8545`

### Port Already in Use

**Symptom**: Container exits with port binding error

**Solution**: Stop conflicting service or change port mapping in docker-compose.yml

```bash
# Find process using port 8545
lsof -i :8545

# Kill the process or change the port
```

### JSON-RPC Connection Refused

**Symptom**: `curl: (7) Failed to connect to localhost port 8545`

**Solutions**:

1. Verify container is running: `docker compose ps`
2. Check if RPC is enabled in logs: `docker logs besu-validator-0 | grep rpc`
3. Wait for startup period to complete

### Out of Memory

**Symptom**: Container killed by OOM

**Solution**: Increase memory limit in docker-compose.yml:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
```

## Production Considerations

The dev network configuration is **not suitable for production**. For production deployments:

1. Use a proper consensus mechanism (IBFT 2.0, QBFT, or Clique)
2. Configure genesis file with appropriate chain parameters
3. Set up proper key management for validators
4. Enable metrics and monitoring endpoints
5. Configure TLS for RPC endpoints
6. Implement proper backup and recovery procedures

See [Besu documentation](https://besu.hyperledger.org/stable/private-networks) for production deployment guidance.

## Related Documentation

- [Infrastructure Overview](./infrastructure.md) - Full Docker Compose stack
- [Besu Order Sharing Flow](./besu-order-sharing-flow.md) - Privacy group patterns
- [E2E Blockchain Tests](../../tests/e2e-blockchain.e2e.ts) - Test implementation
