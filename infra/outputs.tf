output "besu_rpc_endpoints" {
  description = "JSON-RPC endpoints for each Besu validator node."
  value       = module.besu_devnet.rpc_endpoints
}

output "besu_container_names" {
  description = "Container names for all Besu validators."
  value       = module.besu_devnet.container_names
}

output "fabric_peer_endpoints" {
  description = "gRPC endpoints for Fabric peer nodes."
  value       = module.fabric_testnet.peer_endpoints
}

output "fabric_orderer_endpoint" {
  description = "Orderer gRPC endpoint."
  value       = module.fabric_testnet.orderer_endpoint
}

output "corda_rpc_endpoints" {
  description = "RPC endpoints for Corda nodes."
  value       = module.corda_nodes.rpc_endpoints
}

output "corda_container_names" {
  description = "Container names for all Corda nodes."
  value       = module.corda_nodes.container_names
}
