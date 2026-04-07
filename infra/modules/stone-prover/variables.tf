# Stone Prover Module Variables
#
# Configuration variables for the Stone STARK prover container.

variable "image" {
  description = "Docker image for the Stone prover"
  type        = string
  default     = "enterprise-blockchain/stone-prover:latest"
}

variable "network_name" {
  description = "Docker network to attach the container to"
  type        = string
  default     = "enterprise-blockchain-net"
}

variable "grpc_port" {
  description = "Host port for gRPC API (maps to container port 10000)"
  type        = number
  default     = 10000
}

variable "metrics_port" {
  description = "Host port for Prometheus metrics (maps to container port 9100)"
  type        = number
  default     = 9100
}

variable "cairo_artifacts_path" {
  description = "Host path to Cairo compiled artifacts directory"
  type        = string
  default     = "./cairo/artifacts"
}

variable "proofs_output_path" {
  description = "Host path for proof output files"
  type        = string
  default     = "./proofs"
}

variable "memory_limit" {
  description = "Memory limit in MB (Stone prover is memory-intensive)"
  type        = number
  default     = 8192
}

variable "cpu_shares" {
  description = "CPU shares for the container (relative weight)"
  type        = number
  default     = 4096
}

variable "max_concurrent_jobs" {
  description = "Maximum concurrent proof generation jobs"
  type        = number
  default     = 4
}

variable "log_level" {
  description = "Logging level (trace, debug, info, warn, error)"
  type        = string
  default     = "info"

  validation {
    condition     = contains(["trace", "debug", "info", "warn", "error"], var.log_level)
    error_message = "Log level must be one of: trace, debug, info, warn, error"
  }
}
