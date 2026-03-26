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
    ip       = "127.0.0.1"
  }

  env = [
    "BESU_NETWORK=dev",
    "BESU_MINER_ENABLED=true",
    "BESU_MINER_COINBASE=0x${format("%040x", count.index)}",
    "BESU_RPC_HTTP_ENABLED=true",
    "BESU_RPC_HTTP_HOST=0.0.0.0",
    "BESU_RPC_HTTP_CORS_ORIGINS=localhost",
    "BESU_HOST_ALLOWLIST=localhost,127.0.0.1",
    "BESU_DATA_PATH=/opt/besu/data",
  ]

  # NOTE: RPC binds to 0.0.0.0 inside the container, but host ports are
  # published on 127.0.0.1 only (see ports block). CORS and host-allowlist
  # are restricted to localhost for local-dev safety.
  command = [
    "--network=dev",
    "--rpc-http-enabled",
    "--rpc-http-host=0.0.0.0",
    "--rpc-http-cors-origins=http://localhost",
    "--host-allowlist=localhost,127.0.0.1",
    "--miner-enabled",
    "--miner-coinbase=0x${format("%040x", count.index)}",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "besu-validator"
  }
}
