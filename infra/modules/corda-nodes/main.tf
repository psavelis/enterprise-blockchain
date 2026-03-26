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
  }

  env = [
    "MY_LEGAL_NAME=O=${title(local.nodes[count.index])},L=London,C=GB",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "corda-node"
  }
}
