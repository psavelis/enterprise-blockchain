# Skill: Integration Adapters & Resilience Patterns

## When to use

When connecting domain modules to real blockchain platform runtimes (Besu JSON-RPC, Fabric gRPC Gateway, Corda REST) and need retry logic, circuit breakers, gas estimation, or nonce management.

## Key concepts

- **Protocol adapter**: Transforms domain events into platform-specific transaction shapes (e.g., `BesuSelectiveDisclosureAdapter.publishAudienceView()` → `BesuContractCall`). Stateless, no I/O.
- **Integration client sketch**: Thin wrapper around platform SDKs (ethers, fabric-gateway, HTTP) that handles connection, signing, and submission. Contains I/O.
- **Retry policy**: Exponential backoff with jitter. Platform-specific defaults: Fabric (5 retries, 500ms base), Besu (3 retries, 1000ms base), Corda (4 retries, 750ms base).
- **Circuit breaker**: Three-state machine (CLOSED → OPEN → HALF_OPEN → CLOSED). Opens after N failures, auto-resets after a cooldown period.
- **Nonce management**: ethers `NonceManager` wraps a `Wallet` to auto-sequence concurrent transactions from the same account. Critical for consortium deployments.
- **Gas estimation**: `estimateGas()` RPC call before building transactions. Supports manual override for known-cost operations.

## Implementation pattern

```
RetryPolicy { maxRetries, baseDelayMs, backoffFactor, jitter }
withRetry(fn, policy) → Promise<T>   // exponential backoff with jitter
CircuitBreaker(threshold, cooldownMs)
  ├── execute(fn) → Promise<T>
  ├── state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  └── reset()

# Besu (ISP-compliant interfaces)
IBesuProfileFactory     → createProfileFromEnv(), createProfile()
IBesuProviderFactory    → createProvider(), createSigner(), createManagedSigner(), createContract()
IBesuGasEstimator       → estimateGas(profile, tx, override?)
IBesuTransactionBuilder → buildAnchorOrderTransaction(), buildAudienceViewTransaction()
IBesuTransactionSender  → sendTransaction(signer, tx) → txHash

# Fabric (ISP-compliant interfaces)
IFabricProfileFactory    → createProfileFromEnv(), createProfile()
IFabricConnectionFactory → createGrpcClient(), createIdentity(), createSigner()
IFabricGatewayFactory    → createGateway(), getContract()
IFabricProposalBuilder   → buildRecordShipmentProposal(), buildEvaluateRecallRequest()

# Corda (ISP-compliant interfaces)
ICordaProfileFactory  → createProfileFromEnv(), createProfile()
ICordaRequestBuilder  → buildIssueClearanceRequest()
ICordaFlowInvoker     → invokeFlow(request)

# Facade classes for backward compatibility
BesuEthersClientSketch, FabricGatewayClientSketch, CordaGatewayClientSketch
```

## Pitfalls

- Don't retry non-idempotent operations without nonce management — you'll double-submit.
- Circuit breakers should be scoped per-endpoint, not per-client — a failing peer shouldn't block the orderer.
- Gas estimation against a dev-mode Besu node returns 0 for free-gas networks; always allow manual override.
- Fabric transient data (private payloads) must be passed as `Uint8Array`, not strings.

## References

- `modules/integrations/shared/src/retry.ts` — retry policies, circuit breaker
- `modules/integrations/besu-client/src/ports.ts` — ISP interfaces
- `modules/integrations/besu-client/src/error-mapper.ts` — error code extraction
- `modules/integrations/besu-client/src/index.ts` — implementations
- `modules/integrations/fabric-gateway/src/ports.ts` — ISP interfaces
- `modules/integrations/fabric-gateway/src/index.ts` — implementations
- `modules/integrations/corda-gateway/src/ports.ts` — ISP interfaces
- `modules/integrations/corda-gateway/src/index.ts` — implementations
- `tests/integrations.test.ts`
