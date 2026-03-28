variable "image" {
  description = "Besu Docker image."
  type        = string
}

variable "validator_count" {
  description = "Number of Besu dev-network miner nodes."
  type        = number
  default     = 4

  validation {
    condition     = var.validator_count >= 1 && var.validator_count <= 10
    error_message = "validator_count must be between 1 and 10."
  }
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

variable "memory_limit_mb" {
  description = "Memory limit per Besu container in MB. Besu JVM defaults benefit from at least 1024 MB."
  type        = number
  default     = 1024
}
