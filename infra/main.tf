# Shared Docker network for all blockchain containers.
resource "docker_network" "blockchain" {
  name = var.network_name
}

module "besu_devnet" {
  source = "./modules/besu-devnet"

  image           = var.besu_image
  validator_count = var.besu_validator_count
  chain_id        = var.besu_chain_id
  network_id      = docker_network.blockchain.id
}

module "fabric_testnet" {
  source = "./modules/fabric-testnet"

  peer_image    = var.fabric_peer_image
  orderer_image = var.fabric_orderer_image
  network_id    = docker_network.blockchain.id
}

module "corda_nodes" {
  source = "./modules/corda-nodes"

  image      = var.corda_image
  network_id = docker_network.blockchain.id
}
