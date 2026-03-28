# Infrastructure

Terraform configuration for local blockchain development networks. Provisions Docker containers for Besu, Fabric, and Corda — matching the `docker-compose.yml` topology.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- [Docker Engine](https://docs.docker.com/engine/install/) running locally

## Quick Start

```bash
cd infra/environments/dev
terraform init
terraform plan
terraform apply
```

## Architecture

```
infra/
├── main.tf              # Root module — composes sub-modules
├── variables.tf         # Global variables (images, counts, secrets)
├── outputs.tf           # Aggregated endpoints
├── providers.tf         # Provider constraints
├── environments/
│   └── dev/main.tf      # Dev environment (2 validators, dev network)
└── modules/
    ├── besu-devnet/      # Besu JSON-RPC validator nodes
    ├── fabric-testnet/   # Fabric orderer + peer nodes
    └── corda-nodes/      # Corda notary + party nodes
```

## Modules

| Module           | Containers               | Default Ports | Health Check               |
| ---------------- | ------------------------ | ------------- | -------------------------- |
| `besu-devnet`    | N validators (default 4) | 8545–8548     | `eth_blockNumber` JSON-RPC |
| `fabric-testnet` | 1 orderer + 2 peers      | 7050–7052     | TCP `nc -z`                |
| `corda-nodes`    | notary + partyA + partyB | 10006–10008   | TCP `nc -z`                |

## Variables

Key variables exposed at the root level:

| Variable                  | Type     | Default                           | Description                    |
| ------------------------- | -------- | --------------------------------- | ------------------------------ |
| `besu_image`              | `string` | `hyperledger/besu:24.12.2`        | Besu Docker image              |
| `besu_validator_count`    | `number` | `4`                               | Number of validator containers |
| `besu_wallet_private_key` | `string` | `""`                              | Sensitive — deploy key for dev |
| `fabric_peer_image`       | `string` | `hyperledger/fabric-peer:2.5`     | Fabric peer image              |
| `fabric_orderer_image`    | `string` | `hyperledger/fabric-orderer:2.5`  | Fabric orderer image           |
| `corda_image`             | `string` | `corda/corda-zulu-java11-5.1:5.1` | Corda node image               |
| `corda_rpc_password`      | `string` | `""`                              | Sensitive — Corda RPC password |
| `network_name`            | `string` | `enterprise-blockchain-net`       | Shared Docker network          |

## Security Notes

- All container ports bind to `127.0.0.1` — not exposed externally.
- Sensitive variables (`besu_wallet_private_key`, `corda_rpc_password`) are marked `sensitive = true` and will not appear in plan output.
- CORS origins restricted to `localhost` on Besu nodes.
- For production, replace Docker provider with cloud-native orchestration (EKS, AKS, GKE) and use Vault/KMS for secrets.

## Connecting to Examples

The Terraform outputs match the endpoints expected by `examples/config/*.env.example`:

```bash
# After terraform apply:
terraform output -json besu_rpc_endpoints
# → ["http://localhost:8545", "http://localhost:8546", ...]

# Copy and adjust:
cp examples/config/besu.env.example examples/config/.env
# Set BESU_RPC_URL to the first endpoint from the output.
```
