terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

locals {
  orgs = ["org1", "org2"]
}

resource "docker_image" "peer" {
  name         = var.peer_image
  keep_locally = true
}

resource "docker_image" "orderer" {
  name         = var.orderer_image
  keep_locally = true
}

resource "docker_container" "orderer" {
  name  = "fabric-orderer"
  image = docker_image.orderer.image_id

  networks_advanced {
    name = var.network_id
  }

  ports {
    internal = 7050
    external = var.orderer_port
  }

  env = [
    "FABRIC_LOGGING_SPEC=INFO",
    "ORDERER_GENERAL_LISTENADDRESS=0.0.0.0",
    "ORDERER_GENERAL_BOOTSTRAPMETHOD=none",
    "ORDERER_CHANNELPARTICIPATION_ENABLED=true",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "fabric-orderer"
  }
}

resource "docker_container" "peer" {
  count = length(local.orgs)
  name  = "fabric-peer-${local.orgs[count.index]}"
  image = docker_image.peer.image_id

  networks_advanced {
    name = var.network_id
  }

  ports {
    internal = 7051
    external = var.peer_base_port + count.index
  }

  env = [
    "CORE_PEER_ID=peer0.${local.orgs[count.index]}.example.com",
    "CORE_PEER_ADDRESS=peer0.${local.orgs[count.index]}.example.com:7051",
    "CORE_PEER_LOCALMSPID=${title(local.orgs[count.index])}MSP",
    "CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.${local.orgs[count.index]}.example.com:7051",
    "FABRIC_LOGGING_SPEC=INFO",
  ]

  restart = "unless-stopped"

  labels {
    label = "enterprise-blockchain"
    value = "fabric-peer"
  }
}
