output "rpc_endpoints" {
  description = "JSON-RPC HTTP endpoints for each validator."
  value = [
    for c in docker_container.validator :
    "http://localhost:${c.ports[0].external}"
  ]
}

output "container_names" {
  description = "Container names for all Besu validators."
  value       = [for c in docker_container.validator : c.name]
}
