# Stone Prover Module Outputs
#
# Exports connection details and status information.

output "grpc_endpoint" {
  description = "gRPC endpoint for the Stone prover"
  value       = "localhost:${var.grpc_port}"
}

output "metrics_endpoint" {
  description = "Prometheus metrics endpoint"
  value       = "localhost:${var.metrics_port}"
}

output "container_id" {
  description = "Docker container ID"
  value       = docker_container.stone_prover.id
}

output "container_name" {
  description = "Docker container name"
  value       = docker_container.stone_prover.name
}

output "image_id" {
  description = "Docker image ID"
  value       = docker_image.stone_prover.image_id
}
