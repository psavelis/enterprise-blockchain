output "peer_endpoints" {
  description = "gRPC endpoints for each Fabric peer."
  value = [
    for c in docker_container.peer :
    "localhost:${c.ports[0].external}"
  ]
}

output "orderer_endpoint" {
  description = "Orderer endpoint."
  value       = "localhost:${docker_container.orderer.ports[0].external}"
}
