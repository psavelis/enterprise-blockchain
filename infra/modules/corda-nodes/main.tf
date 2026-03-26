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

  env = [
    "MY_LEGAL_NAME=O=${local.legal_names[local.nodes[count.index]]},L=London,C=GB",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "corda-node"
  }
}
