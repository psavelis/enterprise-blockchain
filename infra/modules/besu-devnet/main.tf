terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

resource "docker_image" "besu" {
  name         = var.image
  keep_locally = true
}

resource "docker_container" "validator" {
  count = var.validator_count
  name  = "besu-validator-${count.index}"
  image = docker_image.besu.image_id

  networks_advanced {
    name = var.network_id
  }

  ports {
    internal = 8545
    external = var.rpc_base_port + count.index
  }

  env = [
    "BESU_NETWORK=dev",
    "BESU_MINER_ENABLED=true",
    "BESU_MINER_COINBASE=0x0000000000000000000000000000000000000000",
    "BESU_RPC_HTTP_ENABLED=true",
    "BESU_RPC_HTTP_HOST=0.0.0.0",
    "BESU_RPC_HTTP_CORS_ORIGINS=*",
    "BESU_HOST_ALLOWLIST=*",
    "BESU_DATA_PATH=/opt/besu/data",
  ]

  command = [
    "--network=dev",
    "--rpc-http-enabled",
    "--rpc-http-host=0.0.0.0",
    "--rpc-http-cors-origins=*",
    "--host-allowlist=*",
    "--miner-enabled",
    "--miner-coinbase=0x0000000000000000000000000000000000000000",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "besu-validator"
  }
}
