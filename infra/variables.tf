variable "besu_image" {
  description = "Docker image for Hyperledger Besu nodes."
  type        = string
  default     = "hyperledger/besu:24.12.2"
}

variable "besu_validator_count" {
  description = "Number of Besu dev-network miner nodes."
  type        = number
  default     = 4
}

variable "besu_chain_id" {
  description = "EVM chain ID for the Besu dev network."
  type        = number
  default     = 1337
}

variable "besu_wallet_private_key" {
  description = "Hex-encoded private key for deploying contracts on Besu dev-net. Use only for local development."
  type        = string
  default     = ""
  sensitive   = true
}

variable "fabric_peer_image" {
  description = "Docker image for Hyperledger Fabric peers."
  type        = string
  default     = "hyperledger/fabric-peer:2.5"
}

variable "fabric_orderer_image" {
  description = "Docker image for Hyperledger Fabric orderer."
  type        = string
  default     = "hyperledger/fabric-orderer:2.5"
}

variable "corda_image" {
  description = "Docker image for Corda nodes."
  type        = string
  default     = "corda/corda-zulu-java11-5.1:5.1"
}

variable "corda_rpc_password" {
  description = "RPC password for Corda node access. Use only for local development."
  type        = string
  default     = ""
  sensitive   = true
}

variable "network_name" {
  description = "Docker network name shared across all blockchain containers."
  type        = string
  default     = "enterprise-blockchain-net"
}

# ── Stone STARK Prover Variables ─────────────────────────────────────────

variable "stone_prover_image" {
  description = "Docker image for the Stone STARK prover"
  type        = string
  default     = "enterprise-blockchain/stone-prover:latest"
}

variable "stone_prover_grpc_port" {
  description = "Host port for Stone prover gRPC API"
  type        = number
  default     = 10000
}

variable "stone_prover_metrics_port" {
  description = "Host port for Stone prover Prometheus metrics"
  type        = number
  default     = 9100
}

variable "cairo_artifacts_path" {
  description = "Host path to compiled Cairo circuit artifacts"
  type        = string
  default     = "./cairo/artifacts"
}

variable "proofs_output_path" {
  description = "Host path for proof output files"
  type        = string
  default     = "./proofs"
}

variable "stone_prover_memory_limit" {
  description = "Memory limit for Stone prover in MB"
  type        = number
  default     = 8192
}

variable "stone_prover_max_jobs" {
  description = "Maximum concurrent proof generation jobs"
  type        = number
  default     = 4
}

variable "stone_prover_log_level" {
  description = "Log level for Stone prover"
  type        = string
  default     = "info"
}
