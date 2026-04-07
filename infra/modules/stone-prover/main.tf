# Stone Prover Terraform Module
#
# Provisions the Stone STARK prover service as a Docker container.
# The prover exposes a gRPC API for proof generation and verification.
#
# This module follows the same patterns as other infrastructure modules
# in this repository (besu-devnet, fabric-testnet, corda-nodes).
#
# References:
# - https://github.com/starkware-libs/stone-prover
# - https://registry.terraform.io/providers/kreuzwerker/docker/latest

terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

# ── Local Variables ─────────────────────────────────────────────────────
locals {
  container_name = "stone-prover"
  internal_port  = 10000
  metrics_port   = 9100
}

# ── Docker Image ────────────────────────────────────────────────────────
resource "docker_image" "stone_prover" {
  name         = var.image
  keep_locally = true

  build {
    context    = "${path.module}/../../docker/stone-prover"
    dockerfile = "Dockerfile"
    tag        = [var.image]

    build_args = {
      BUILDKIT_INLINE_CACHE = "1"
    }
  }
}

# ── Docker Container ────────────────────────────────────────────────────
resource "docker_container" "stone_prover" {
  name  = local.container_name
  image = docker_image.stone_prover.image_id

  # Network configuration
  networks_advanced {
    name = var.network_name
  }

  # Port mappings (localhost only for security)
  ports {
    internal = local.internal_port
    external = var.grpc_port
    ip       = "127.0.0.1"
  }

  ports {
    internal = local.metrics_port
    external = var.metrics_port
    ip       = "127.0.0.1"
  }

  # Volume mounts
  volumes {
    host_path      = var.cairo_artifacts_path
    container_path = "/app/cairo"
    read_only      = true
  }

  volumes {
    host_path      = var.proofs_output_path
    container_path = "/app/proofs"
    read_only      = false
  }

  # Environment variables
  env = [
    "RUST_LOG=${var.log_level}",
    "PROVER_MAX_JOBS=${var.max_concurrent_jobs}",
  ]

  # Resource limits (Stone prover is memory-intensive)
  memory      = var.memory_limit * 1024
  memory_swap = var.memory_limit * 1024
  cpu_shares  = var.cpu_shares

  # Security options
  security_opts = ["no-new-privileges:true"]
  restart       = "unless-stopped"

  # Health check
  healthcheck {
    test         = ["CMD", "grpc_health_probe", "-addr=:${local.internal_port}"]
    interval     = "10s"
    timeout      = "5s"
    start_period = "30s"
    retries      = 3
  }

  # Logging
  log_driver = "json-file"
  log_opts = {
    "max-size" = "10m"
    "max-file" = "3"
  }

  # Wait for image to be ready
  depends_on = [docker_image.stone_prover]
}
