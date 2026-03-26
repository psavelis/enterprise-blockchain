module "dev" {
  source = "../../"

  besu_validator_count = 2
  network_name         = "enterprise-blockchain-dev"
}
