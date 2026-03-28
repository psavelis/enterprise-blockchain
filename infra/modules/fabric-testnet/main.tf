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

resource "docker_volume" "orderer_data" {
  name = "fabric-orderer-data"
}

resource "docker_volume" "peer_data" {
  count = length(local.orgs)
  name  = "fabric-peer-${local.orgs[count.index]}-data"
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
    ip       = "127.0.0.1"
  }

  volumes {
    volume_name    = docker_volume.orderer_data.name
    container_path = "/var/hyperledger/production/orderer"
  }

  env = [
    "FABRIC_LOGGING_SPEC=INFO",
    "ORDERER_GENERAL_LISTENADDRESS=0.0.0.0",
    "ORDERER_GENERAL_BOOTSTRAPMETHOD=none",
    "ORDERER_CHANNELPARTICIPATION_ENABLED=true",
  ]

  restart = "unless-stopped"

  memory = var.memory_limit_mb

  healthcheck {
    test         = ["CMD-SHELL", "echo | nc -z localhost 7050"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 10
    start_period = "15s"
  }

  labels {
    label = "enterprise-blockchain"
    value = "fabric-orderer"
  }

  labels {
    label = "enterprise-blockchain.module"
    value = "fabric-testnet"
  }
}

resource "docker_container" "peer" {
  count = length(local.orgs)
  name  = "fabric-peer-${local.orgs[count.index]}"
  image = docker_image.peer.image_id

  networks_advanced {
    name    = var.network_id
    aliases = ["peer0.${local.orgs[count.index]}.example.com"]
  }

  ports {
    internal = 7051
    external = var.peer_base_port + count.index
    ip       = "127.0.0.1"
  }

  volumes {
    volume_name    = docker_volume.peer_data[count.index].name
    container_path = "/var/hyperledger/production"
  }

  env = [
    "CORE_PEER_ID=peer0.${local.orgs[count.index]}.example.com",
    "CORE_PEER_ADDRESS=peer0.${local.orgs[count.index]}.example.com:7051",
    "CORE_PEER_LOCALMSPID=${title(local.orgs[count.index])}MSP",
    "CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.${local.orgs[count.index]}.example.com:7051",
    "FABRIC_LOGGING_SPEC=INFO",
  ]

  restart = "unless-stopped"

  memory = var.memory_limit_mb

  healthcheck {
    test         = ["CMD-SHELL", "echo | nc -z localhost 7051"]
    interval     = "10s"
    timeout      = "5s"
    retries      = 10
    start_period = "15s"
  }

  labels {
    label = "enterprise-blockchain"
    value = "fabric-peer"
  }

  labels {
    label = "enterprise-blockchain.module"
    value = "fabric-testnet"
  }
}
