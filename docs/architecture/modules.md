# Module Architecture

Each domain module follows [hexagonal architecture](https://alistair.cockburn.us/hexagonal-architecture/) (a.k.a. ports and adapters).

## Layer Structure

```
modules/<name>/src/
├── domain/          # Entities, value objects, business rules
│   ├── entities.ts  # Core types — no framework imports
│   └── ports.ts     # Repository interfaces (input/output ports)
├── application/     # Use cases — depend only on domain ports
│   └── <service>.ts
├── infrastructure/  # Adapters — implement domain ports
│   └── in-memory-store.ts
└── index.ts         # Facade — wires layers, re-exports public API
```

## Dependency Rule

Dependencies point inward: infrastructure → application → domain. The domain layer has zero external imports.

## Facade Pattern

Each module's `index.ts` exports:

- Domain types (as `type` exports)
- Application services (class exports)
- Infrastructure implementations (for direct use)
- A convenience facade class that wires everything together with sensible defaults

The facade accepts an optional `options` object for dependency injection:

```typescript
const ledger = new TraceabilityLedger(); // defaults
const ledger = new TraceabilityLedger({ store: myFabricStore }); // injected
```

## Modules

| Module           | Domain                                 | Application Service                                       | Port                    |
| ---------------- | -------------------------------------- | --------------------------------------------------------- | ----------------------- |
| `traceability`   | ProductLot, Shipment, TelemetryReading | RecallAssessor                                            | TraceabilityRepository  |
| `aid-settlement` | AidGrant, RedemptionClaim              | Reconciler                                                | AidSettlementRepository |
| `privacy`        | PurchaseOrder, SharedOrderView         | ViewProjector                                             | OrderRepository         |
| `credentialing`  | ProviderProfile, ClinicalCredential    | ClearanceEvaluator                                        | CredentialRepository    |
| `hsm`            | -                                      | AsymmetricKeyService, SymmetricKeyService                 | HsmPort                 |
| `mpc`            | -                                      | MPCEngine                                                 | -                       |
| `protocols`      | -                                      | FabricAdapter, BesuAdapter, CordaAdapter                  | PrivacyProtocolPort     |
| `integrations`   | -                                      | FabricGatewayClient, BesuEthersClient, CordaGatewayClient | -                       |
| `shared`         | -                                      | sha256hex, InMemoryStore, ConsoleLogger                   | ReadonlyStore, Logger   |
