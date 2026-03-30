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

**Circuit Breaker**: Three-state machine: closed → open → half-open → closed. Opens after N consecutive failures (`failureThreshold`). Auto-resets after `cooldownMs`. Use `getState()` to check current state.

**Nonce Management**: EVM transactions require sequential nonces. `NonceManager` wraps `Wallet` to auto-sequence concurrent submissions from same account.

**Gas Estimation**: `eth_estimateGas` RPC before building transaction. Returns 0 on free-gas networks (dev mode). Always support manual override.

## Architecture

```
Integration Layer (modules/integrations/)
├── shared/src/
│   ├── retry.ts  → RetryPolicy, withRetry(), CircuitBreaker
│   └── env.ts    → Environment variable loading
├── besu-client/src/
│   ├── ports.ts       → ISP-compliant interfaces
│   ├── index.ts       → Implementations
│   └── error-mapper.ts → Blockchain error extraction
├── fabric-gateway/src/
│   ├── ports.ts  → ISP-compliant interfaces
│   └── index.ts  → Implementations
└── corda-gateway/src/
    ├── ports.ts  → ISP-compliant interfaces
    └── index.ts  → Implementations
```

**Interface Segregation (ISP)**: Clients split into focused interfaces. Consumers depend only on required capabilities:

```typescript
// Besu
IBesuProfileFactory     → createProfileFromEnv(), createProfile()
IBesuProviderFactory    → createProvider(), createSigner(), createManagedSigner()
IBesuGasEstimator       → estimateGas(profile, tx, override?)
IBesuTransactionBuilder → buildAnchorOrderTransaction(), buildAudienceViewTransaction()
IBesuTransactionSender  → sendTransaction(signer, tx)

// Fabric
IFabricProfileFactory    → createProfileFromEnv(), createProfile()
IFabricConnectionFactory → createGrpcClient(), createIdentity(), createSigner()
IFabricGatewayFactory    → createGateway(), getContract()
IFabricProposalBuilder   → buildRecordShipmentProposal(), buildEvaluateRecallRequest()

// Corda
ICordaProfileFactory  → createProfileFromEnv(), createProfile()
ICordaRequestBuilder  → buildIssueClearanceRequest()
ICordaFlowInvoker     → invokeFlow(request)
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

## Anti-patterns

**Retrying non-idempotent operations without nonce management**: Double-submit risk. Always use `NonceManager` for EVM transactions.

**Global circuit breaker**: Failing peer should not block orderer. Scope breakers per-endpoint or per-service.

**Trusting dev-mode gas estimates**: Free-gas networks return 0. Always allow manual override via `gasLimit` parameter.

**String encoding for Fabric transient data**: Private payloads must be `Uint8Array`. String encoding corrupts binary data.

**Ignoring partial failures**: Batch submissions may partially succeed. Track individual transaction status, not just batch result.

**Hardcoded timeouts**: Network conditions vary. Load timeouts from configuration. Default to conservative values.

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

## Related Skills

- [platform-selection](platform-selection.md) — Protocol selection criteria (Besu vs Fabric vs Corda)
- [smart-contract-patterns](smart-contract-patterns.md) — Solidity contracts deployed via Besu client

## References

- `modules/integrations/shared/src/retry.ts`
- `modules/integrations/besu-client/src/ports.ts`
- `modules/integrations/besu-client/src/index.ts`
- `modules/integrations/besu-client/src/error-mapper.ts`
- `modules/integrations/fabric-gateway/src/ports.ts`
- `modules/integrations/fabric-gateway/src/index.ts`
- `modules/integrations/corda-gateway/src/ports.ts`
- `modules/integrations/corda-gateway/src/index.ts`
- `tests/integrations.test.ts`
