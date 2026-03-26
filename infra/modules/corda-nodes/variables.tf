variable "image" {
  description = "Corda Docker image."
  type        = string
}

variable "network_id" {
  description = "Docker network ID to attach containers to."
  type        = string
}

variable "rpc_base_port" {
  description = "Base host port for Corda RPC endpoints."
  type        = number
  default     = 10006
}
