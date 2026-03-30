# Integration Adapters

SDK client patterns with retry logic, circuit breakers, and blockchain-specific concerns.

## When to Use

- Connecting domain modules to Besu JSON-RPC, Fabric gRPC Gateway, or Corda REST
- Implementing retry policies with exponential backoff
- Managing EVM nonces for concurrent transaction submission
- Estimating gas with fallback to manual override

## When NOT to Use

- Protocol-agnostic domain logic (use protocol adapters instead)
- Mock/simulation environments (use in-memory implementations)
- Batch operations requiring transaction atomicity

## Key Concepts

**Protocol Adapter vs Integration Client**: Adapters transform domain events to transaction shapes (stateless, no I/O). Clients handle SDK connection, signing, and submission (stateful, I/O).

**Retry Policy**: Exponential backoff with jitter (±15%). Parameters: `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `retryableErrors`. Platform-specific error codes determine retryability.

**Circuit Breaker**: Three-state machine: closed → open → half-open → closed. Opens after N consecutive failures (`failureThreshold`). Auto-resets after `cooldownMs`.

**Nonce Management**: EVM transactions require sequential nonces. `NonceManager` wraps `Wallet` to auto-sequence concurrent submissions from same account.

**Gas Estimation**: `eth_estimateGas` RPC before building transaction. Returns 0 on free-gas networks (dev mode). Always support manual override.

## Architecture

```
modules/integrations/
├── shared/src/
│   ├── retry.ts         → RetryPolicy, withRetry(), CircuitBreaker
│   ├── collection-store.ts → CollectionStore<K,V> (DRY storage pattern)
│   └── env.ts           → Environment variable loading
├── besu-client/src/
│   ├── ports.ts         → IBesuProfileFactory, IBesuProviderFactory,
│   │                      IBesuGasEstimator, IBesuTransactionBuilder,
│   │                      IBesuTransactionSender
│   ├── index.ts         → Implementations
│   └── error-mapper.ts  → extractBesuErrorCode()
├── fabric-gateway/src/
│   ├── ports.ts         → IFabricProfileFactory, IFabricConnectionFactory,
│   │                      IFabricGatewayFactory, IFabricProposalBuilder
│   └── index.ts         → Implementations
└── corda-gateway/src/
    ├── ports.ts         → ICordaProfileFactory, ICordaRequestBuilder,
    │                      ICordaFlowInvoker
    └── index.ts         → Implementations
```

## ISP Interface Catalog

### Besu Interfaces

```typescript
IBesuProfileFactory
├── createProfileFromEnv(): BesuProfile
└── createProfile(config: BesuConfig): BesuProfile

IBesuProviderFactory
├── createProvider(profile: BesuProfile): JsonRpcProvider
├── createSigner(profile: BesuProfile, provider: JsonRpcProvider): Wallet
└── createManagedSigner(profile: BesuProfile, provider: JsonRpcProvider): NonceManager

IBesuGasEstimator
└── estimateGas(profile: BesuProfile, tx: TransactionRequest, override?: bigint): Promise<bigint>

IBesuTransactionBuilder
├── buildAnchorOrderTransaction(orderId: string, hash: string): TransactionRequest
└── buildAudienceViewTransaction(orderId: string, audience: string, auditProof: string): TransactionRequest

IBesuTransactionSender
└── sendTransaction(signer: Signer, tx: TransactionRequest): Promise<TransactionResponse>
```

### Fabric Interfaces

```typescript
IFabricProfileFactory
├── createProfileFromEnv(): FabricProfile
└── createProfile(config: FabricConfig): FabricProfile

IFabricConnectionFactory
├── createGrpcClient(profile: FabricProfile): Promise<GrpcClient>
├── createIdentity(profile: FabricProfile): Identity
└── createSigner(profile: FabricProfile): Promise<Signer>

IFabricGatewayFactory
├── createGateway(client: GrpcClient, identity: Identity, signer: Signer): Promise<Gateway>
└── getContract(gateway: Gateway, channelName: string, chaincodeName: string): Contract

IFabricProposalBuilder
├── buildRecordShipmentProposal(shipment: ShipmentData): ProposalOptions
└── buildEvaluateRecallRequest(lotId: string, threshold: number): EvaluateOptions
```

### Corda Interfaces

```typescript
ICordaProfileFactory
├── createProfileFromEnv(): CordaProfile
└── createProfile(config: CordaConfig): CordaProfile

ICordaRequestBuilder
└── buildIssueClearanceRequest(clearance: ClearanceData): FlowRequest

ICordaFlowInvoker
└── invokeFlow(profile: CordaProfile, request: FlowRequest): Promise<FlowResponse>
```

## Retry Configuration

| Platform | Max Attempts | Base Delay | Max Delay | Retryable Errors               |
| -------- | ------------ | ---------- | --------- | ------------------------------ |
| Fabric   | 4            | 500ms      | 8000ms    | UNAVAILABLE, DEADLINE_EXCEEDED |
| Besu     | 3            | 1000ms     | 15000ms   | SERVER_ERROR, TIMEOUT          |
| Corda    | 3            | 1000ms     | 10000ms   | 502, 503, 504, TIMEOUT         |

## Error Mapping

| Error Code         | Platform | Action                                     |
| ------------------ | -------- | ------------------------------------------ |
| NONCE_TOO_LOW      | Besu     | Abort, resync nonce; do not auto-retry     |
| INSUFFICIENT_FUNDS | Besu     | Abort, surface to caller                   |
| SERVER_ERROR       | Besu     | Retry with backoff (transient RPC failure) |
| UNAVAILABLE        | Fabric   | Retry with backoff                         |
| DEADLINE_EXCEEDED  | Fabric   | Retry with backoff                         |
| 502/503/504        | Corda    | Retry with backoff (gateway errors)        |
| 400/401/403        | Corda    | Abort, do not retry (client errors)        |

## Implementation

```typescript
RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  retryableErrors: string[]
}

async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  nonRetryable?: string[],
  extractErrorCode?: (err: unknown) => string
): Promise<T>

class CircuitBreaker {
  constructor(options?: { failureThreshold?: number; cooldownMs?: number })
  execute<T>(fn: () => Promise<T>): Promise<T>
  getState(): 'closed' | 'open' | 'half-open'
  reset(): void
}

function isRetryable(errorCode: string, policy: RetryPolicy, nonRetryable?: string[]): boolean
function computeDelay(attempt: number, policy: RetryPolicy): number
```

## Must-Preserve Invariants

1. **ISP compliance**: Clients split into focused interfaces; consumers depend only on required capabilities
2. **Retry idempotency**: Only retry idempotent operations or use nonce management
3. **Circuit breaker scope**: One breaker per endpoint, not global
4. **Error code extraction**: Use `extractBesuErrorCode()` for EVM errors, not string matching
5. **Transient data encoding**: Fabric private data must be `Uint8Array`, not string

## Anti-patterns

**Retrying non-idempotent operations without nonce management**: Double-submit risk. Always use `NonceManager` for EVM transactions.

**Global circuit breaker**: Failing peer should not block orderer. Scope breakers per-endpoint or per-service.

**Trusting dev-mode gas estimates**: Free-gas networks return 0. Always allow manual override via `gasLimit` parameter.

**String encoding for Fabric transient data**: Private payloads must be `Uint8Array`. String encoding corrupts binary data.

**Ignoring partial failures**: Batch submissions may partially succeed. Track individual transaction status.

**Hardcoded timeouts**: Network conditions vary. Load timeouts from configuration.

## Related Skills

- [platform-selection](platform-selection.md) — Protocol selection criteria
- [smart-contract-patterns](smart-contract-patterns.md) — Solidity contracts deployed via Besu client

## References

- `modules/integrations/shared/src/retry.ts`
- `modules/integrations/shared/src/collection-store.ts`
- `modules/integrations/besu-client/src/ports.ts`
- `modules/integrations/besu-client/src/index.ts`
- `modules/integrations/besu-client/src/error-mapper.ts`
- `modules/integrations/fabric-gateway/src/ports.ts`
- `modules/integrations/fabric-gateway/src/index.ts`
- `modules/integrations/corda-gateway/src/ports.ts`
- `modules/integrations/corda-gateway/src/index.ts`
- `tests/integrations.test.ts`
