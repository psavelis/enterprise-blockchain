output "besu_rpc_endpoints" {
  description = "JSON-RPC endpoints for each Besu validator node."
  value       = module.besu_devnet.rpc_endpoints
}

output "fabric_peer_endpoints" {
  description = "gRPC endpoints for Fabric peer nodes."
  value       = module.fabric_testnet.peer_endpoints
}

output "corda_rpc_endpoints" {
  description = "RPC endpoints for Corda nodes."
  value       = module.corda_nodes.rpc_endpoints
}
