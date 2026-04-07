# Shared Docker network for all blockchain containers.
resource "docker_network" "blockchain" {
  name = var.network_name
}

module "besu_devnet" {
  source = "./modules/besu-devnet"

  image           = var.besu_image
  validator_count = var.besu_validator_count
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

module "stone_prover" {
  source = "./modules/stone-prover"

  image                = var.stone_prover_image
  network_name         = docker_network.blockchain.name
  grpc_port            = var.stone_prover_grpc_port
  metrics_port         = var.stone_prover_metrics_port
  cairo_artifacts_path = var.cairo_artifacts_path
  proofs_output_path   = var.proofs_output_path
  memory_limit         = var.stone_prover_memory_limit
  max_concurrent_jobs  = var.stone_prover_max_jobs
  log_level            = var.stone_prover_log_level
}
