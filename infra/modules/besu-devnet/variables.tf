variable "image" {
  description = "Besu Docker image."
  type        = string
}

variable "validator_count" {
  description = "Number of IBFT 2.0 validator nodes."
  type        = number
  default     = 4
}

variable "chain_id" {
  description = "EVM chain ID."
  type        = number
  default     = 1337
}

variable "network_id" {
  description = "Docker network ID to attach containers to."
  type        = string
}

variable "rpc_base_port" {
  description = "Base host port for JSON-RPC. Each validator gets base_port + index."
  type        = number
  default     = 8545
}
