output "rpc_endpoints" {
  description = "RPC endpoints for each Corda node."
  value = [
    for c in docker_container.node :
    "localhost:${c.ports[0].external}"
  ]
}

output "container_names" {
  description = "Container names for all Corda nodes."
  value       = [for c in docker_container.node : c.name]
}
