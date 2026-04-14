# Examples

## Business Scenarios

| Example                       | Description                                                         | Module           |
| ----------------------------- | ------------------------------------------------------------------- | ---------------- |
| `food-recall-response`        | Recall planning for contaminated or temperature-exposed food lots   | `traceability`   |
| `consortium-order-sharing`    | Selective disclosure for shared purchase orders across a consortium | `privacy`        |
| `hospital-staffing-clearance` | Credential and sanction checks before assigning clinical work       | `credentialing`  |
| `aid-voucher-reconciliation`  | Voucher settlement and exception reporting for humanitarian aid     | `aid-settlement` |

## Protocol Projections

These examples show the transaction shapes a team might hand to a real platform runtime.

| Example                           | Platform           | Adapter                                                    |
| --------------------------------- | ------------------ | ---------------------------------------------------------- |
| `fabric-traceability-projection`  | Hyperledger Fabric | Chaincode-style invocations for recall and shipment events |
| `besu-order-privacy-projection`   | Hyperledger Besu   | Privacy-group contract calls for selective disclosure      |
| `corda-clearance-flow-projection` | R3 Corda           | Flow/state payloads for staffing clearance decisions       |

## MPC and Key Management

| Example                         | Technique                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| `mpc-sealed-bid-auction`        | Additive secret sharing across three competing suppliers                |
| `mpc-joint-risk-analysis`       | Cross-institution aggregate credit-risk reporting with threshold checks |
| `quantum-resistant-key-sharing` | Shamir 3-of-5 threshold key distribution with hash-ladder anchoring     |

## HSM

| Example                   | Pattern                                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `hsm-transaction-signing` | EC P-256 key generation and ECDSA-SHA256 signing                                   |
| `hsm-key-ceremony`        | Root key ceremony combining HSM signing with 3-of-5 Shamir threshold custodianship |
| `hsm-envelope-encryption` | DEK/KEK envelope encryption for sensitive trade documents                          |
| `hsm-real-pkcs11`         | Real PKCS#11 HSM support with SoftHSM2, multi-algorithm keys, simulator fallback   |

## Post-Quantum Cryptography

NIST FIPS 203/204 compliant implementations demonstrating quantum-resistant patterns.

| Example                            | Technique                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `kyber-kem-key-exchange`           | ML-KEM-768 key encapsulation for quantum-resistant key establishment           |
| `hybrid-kem-settlement`            | X25519 + ML-KEM-768 hybrid KEM for defense-in-depth key exchange               |
| `quantum-safe-payment`             | End-to-end quantum-safe payment flow using hybrid KEM and ML-DSA-65 signatures |
| `quantum-safe-merkle-root-payment` | BIP-360-inspired Pay-to-Merkle-Root with post-quantum commitments              |

## STARK Settlement

| Example                         | Technique                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `stark-cross-border-settlement` | Recursive STARK proofs with ML-DSA-65 signatures, multi-rail settlement (Solana, Bitcoin, fiat) |

## Integration Sketches

| Example                             | SDK                                             |
| ----------------------------------- | ----------------------------------------------- |
| `fabric-gateway-integration-sketch` | `@hyperledger/fabric-gateway` + `@grpc/grpc-js` |
| `besu-ethers-integration-sketch`    | `ethers` v6 with contract ABI                   |
| `corda-rest-integration-sketch`     | HTTP gateway boundary (REST)                    |

## Running

Run all examples:

```bash
npm run examples
```

Run individual examples:

```bash
# Business scenarios
npm run example:food-recall
npm run example:order-sharing
npm run example:staffing-clearance
npm run example:aid-reconciliation

# Protocol projections
npm run example:fabric-projection
npm run example:besu-projection
npm run example:corda-projection

# MPC and threshold cryptography
npm run example:mpc-auction
npm run example:mpc-risk-analysis
npm run example:quantum-key-sharing

# HSM key management
npm run example:hsm-tx-signing
npm run example:hsm-key-ceremony
npm run example:hsm-envelope-encryption
npm run example:hsm-pkcs11

# Post-quantum cryptography
npm run example:kyber-kem
npm run example:hybrid-kem
npm run example:quantum-safe-payment
npm run example:quantum-safe-merkle-root-payment

# STARK settlement
npm run example:stark-settlement

# Integration sketches
npm run example:fabric-gateway
npm run example:besu-ethers
npm run example:corda-rest
```

Full command list in [package.json](../package.json).
