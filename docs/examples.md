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

Run a single example:

```bash
npm run example:food-recall
npm run example:order-sharing
npm run example:staffing-clearance
npm run example:aid-reconciliation
```

Full list of commands in [package.json](../package.json).
