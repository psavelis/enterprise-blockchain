terraform {
  required_version = ">= 1.5"

  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

module "dev" {
  source = "../../"

  besu_validator_count = 2
  network_name         = "enterprise-blockchain-dev"
}
