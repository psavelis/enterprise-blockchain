# ADR-0002: Protocol Adapter Pattern for Multi-Blockchain Support

## Status

Accepted

## Context

The repository supports three enterprise blockchain protocols: Hyperledger Fabric, Hyperledger Besu, and R3 Corda. Each has different:

- Transaction semantics (endorsement vs gas vs flows)
- SDK interfaces (gRPC vs JSON-RPC vs REST)
- Error handling patterns
- Privacy models

We needed a way to express domain operations without coupling to any specific protocol.

## Decision

We implement a **three-tier adapter pattern**:

### 1. Protocol Ports (`modules/protocols/src/`)

Abstract interfaces defining domain operations that can be projected onto any blockchain:

```typescript
export interface TraceabilityProtocolAdapter<TInvocation> {
  createLotCommand(lot: ProductLot): TInvocation;
  recordShipmentCommand(
    shipment: Shipment,
    reading?: TelemetryReading,
  ): TInvocation;
}
```

### 2. Protocol Adapters (`modules/protocols/{besu,fabric,corda}/`)

Stateless transformations from domain events to protocol-specific transaction shapes:

```typescript
export class FabricTraceabilityAdapter implements TraceabilityProtocolAdapter<FabricInvocation> {
  createLotCommand(lot: ProductLot): FabricInvocation {
    return { contract: 'FoodTraceContract', transaction: 'CreateProduct', args: [...] };
  }
}
```

### 3. Integration Clients (`modules/integrations/`)

Stateful SDK wrappers handling connection, retry, circuit breaker, and error mapping:

```typescript
export class BesuEthersClientSketch implements IBesuTransactionSender {
  async sendTransaction(
    signer: NonceManager,
    tx: TransactionRequest,
  ): Promise<string>;
}
```

## Consequences

### Positive

- Domain modules don't know which blockchain they're using
- Protocol adapters are pure functions (easy to test)
- Integration clients encapsulate SDK complexity
- Clear separation: shape transformation vs I/O

### Negative

- Three layers to navigate for a single operation
- Must keep adapter return types generic enough for all protocols
- SDK version upgrades still require integration client changes

## References

- `skills/platform-selection.md:33-51` - Architecture diagram
- `skills/integration-adapters.md:19-20` - Protocol adapter vs integration client
- `modules/protocols/fabric/src/index.ts` - Fabric adapter implementation
- `modules/integrations/besu-client/src/index.ts` - Besu client implementation
