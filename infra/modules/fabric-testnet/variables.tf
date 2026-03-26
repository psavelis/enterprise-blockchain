variable "peer_image" {
  description = "Fabric peer Docker image."
  type        = string
}

variable "orderer_image" {
  description = "Fabric orderer Docker image."
  type        = string
}

variable "network_id" {
  description = "Docker network ID to attach containers to."
  type        = string
}

variable "peer_base_port" {
  description = "Base host port for peer gRPC endpoints."
  type        = number
  default     = 7051
}

variable "orderer_port" {
  description = "Host port for the orderer."
  type        = number
  default     = 7050
}
