# Food Trace Chaincode

Hyperledger Fabric 2.5+ chaincode for food supply-chain traceability.

## Files

| File                             | Purpose                                                         |
| -------------------------------- | --------------------------------------------------------------- |
| `FoodTraceContract.ts`           | In-memory version for unit testing (no Fabric dependency)       |
| `FoodTraceContractDeployable.ts` | Deployable version extending `fabric-contract-api` Contract     |
| `index.ts`                       | Entry point exporting contract list for `fabric-chaincode-node` |

## Building

```bash
cd contracts/fabric
npm install
npm run build
```

## Deploying to a Fabric 2.5 peer

### 1. Package the chaincode

All commands below assume you run from the **repository root** (`enterprise-blockchain/`).

```bash
peer lifecycle chaincode package food-trace.tar.gz \
  --path ./contracts/fabric \
  --lang node \
  --label food-trace_1.0
```

### 2. Install on peers

```bash
# On each endorsing peer
peer lifecycle chaincode install food-trace.tar.gz
```

### 3. Approve for your organization

```bash
# Get the package ID from the install output
peer lifecycle chaincode queryinstalled

peer lifecycle chaincode approveformyorg \
  --channelID supply-chain \
  --name food-trace \
  --version 1.0 \
  --package-id <PACKAGE_ID> \
  --sequence 1 \
  --orderer orderer.example.com:7050
```

### 4. Commit the chaincode definition

```bash
peer lifecycle chaincode commit \
  --channelID supply-chain \
  --name food-trace \
  --version 1.0 \
  --sequence 1 \
  --orderer orderer.example.com:7050 \
  --peerAddresses peer0.org1.example.com:7051 \
  --peerAddresses peer0.org2.example.com:9051
```

### 5. Invoke a transaction

```bash
peer chaincode invoke \
  --channelID supply-chain \
  --name food-trace \
  -c '{"function":"createProduct","Args":["LOT-001","Brazil","FarmCo","2026-01-15"]}' \
  --orderer orderer.example.com:7050 \
  --peerAddresses peer0.org1.example.com:7051
```

## Composite Key Scheme

| Object Type  | Key Attributes                       | Example                                           |
| ------------ | ------------------------------------ | ------------------------------------------------- |
| `productLot` | `[lotId]`                            | `productLot~LOT-001`                              |
| `shipment`   | `[lotId, shipmentId]`                | `shipment~LOT-001~SHIP-001`                       |
| `telemetry`  | `[shipmentId, sensorId, recordedAt]` | `telemetry~SHIP-001~TEMP-01~2026-01-16T10:00:00Z` |

## Events

- `LotCreated` — emitted when a new product lot is registered
- `ShipmentRecorded` — emitted when a shipment is recorded against a lot
- `TelemetryRecorded` — emitted when an IoT reading is appended
- `RecallAssessed` — emitted when a recall assessment is evaluated
