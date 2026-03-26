variable "besu_image" {
  description = "Docker image for Hyperledger Besu nodes."
  type        = string
  default     = "hyperledger/besu:24.12.2"
}

variable "besu_validator_count" {
  description = "Number of Besu IBFT 2.0 validator nodes."
  type        = number
  default     = 4
}

variable "besu_chain_id" {
  description = "EVM chain ID for the Besu PoA network."
  type        = number
  default     = 1337
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
  default     = "corda/corda-zulu-java11-5.1:latest"
}

variable "network_name" {
  description = "Docker network name shared across all blockchain containers."
  type        = string
  default     = "enterprise-blockchain-net"
}
