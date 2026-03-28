terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

locals {
  nodes = ["notary", "partya", "partyb"]
  legal_names = {
    notary = "Notary"
    partya = "PartyA"
    partyb = "PartyB"
  }
}

resource "docker_image" "corda" {
  name         = var.image
  keep_locally = true
}

resource "docker_volume" "corda_data" {
  count = length(local.nodes)
  name  = "corda-${local.nodes[count.index]}-data"
}

resource "docker_container" "node" {
  count = length(local.nodes)
  name  = "corda-${local.nodes[count.index]}"
  image = docker_image.corda.image_id

  networks_advanced {
    name = var.network_id
  }

  ports {
    internal = 10006
    external = var.rpc_base_port + count.index
    ip       = "127.0.0.1"
  }

  volumes {
    volume_name    = docker_volume.corda_data[count.index].name
    container_path = "/opt/corda/persistence"
  }

  env = [
    "MY_LEGAL_NAME=O=${local.legal_names[local.nodes[count.index]]},L=London,C=GB",
  ]

  restart = "unless-stopped"

  memory = var.memory_limit_mb

  healthcheck {
    test         = ["CMD-SHELL", "echo | nc -z localhost 10006"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 15
    start_period = "30s"
  }

  labels {
    label = "enterprise-blockchain"
    value = "corda-node"
  }

  labels {
    label = "enterprise-blockchain.module"
    value = "corda-nodes"
  }
}
