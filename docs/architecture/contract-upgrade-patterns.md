# Contract Upgrade Patterns

## Overview

Smart contract upgrade strategy for consortium Besu networks. This document
covers when to use each pattern, the storage collision risks, and the
governance process for coordinating upgrades across consortium participants.

## Pattern Comparison

| Pattern                | Pros                                   | Cons                                       | Use When                           |
| ---------------------- | -------------------------------------- | ------------------------------------------ | ---------------------------------- |
| **UUPS Proxy**         | Gas-efficient, logic in implementation | Must remember `_authorizeUpgrade`          | Stateful contracts (AidSettlement) |
| **Transparent Proxy**  | Admin/user separation automatic        | Extra SLOAD per call for admin check       | High-value treasury contracts      |
| **Diamond (EIP-2535)** | Modular facets, no size limit          | Complex, hard to audit                     | Very large contracts               |
| **Redeploy + Migrate** | Simplest, no proxy overhead            | Stranded data, new address for all parties | Stateless or low-state contracts   |

## Recommended: UUPS for Consortium Contracts

AidSettlement uses the **UUPS (Universal Upgradeable Proxy Standard)** pattern
via OpenZeppelin's `UUPSUpgradeable`. This is the recommended pattern because:

1. **Gas efficiency** — The upgrade logic lives in the implementation, not the
   proxy, saving ~2,100 gas per delegatecall.
2. **Owner-controlled upgrades** — `_authorizeUpgrade()` is restricted to the
   contract owner (or a multisig/governance contract in production).
3. **ERC-7201 namespaced storage** — Prevents storage slot collisions across
   upgrades by hashing the storage struct location.

## Storage Layout Rules

### DO

- Add new state variables only at the end of the storage struct.
- Use `@custom:storage-location` and ERC-7201 to namespace storage.
- Reserve storage gaps (`uint256[50] __gap`) if not using namespaced storage.

### DO NOT

- Remove or reorder existing variables.
- Change variable types (e.g., `uint256` → `uint128`).
- Add variables between existing ones.
- Use `constructor` logic — use `initializer` functions instead.

## Upgrade Flow

```
┌───────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Governance   │────▶│  Deploy new impl │────▶│  upgradeToAnd │
│  vote / agree │     │    (V2 contract) │     │  Call(v2, init)│
└───────────────┘     └──────────────────┘     └───────────────┘
        │                                              │
        │              Proxy address stays the same    │
        │              All state preserved             │
        ▼                                              ▼
  All participants                              New logic active
  use same address                              V1 data intact
```

## Consortium Governance for Upgrades

In a permissioned Besu network, upgrades must be coordinated:

1. **Proposal** — Sponsoring organization deploys V2 implementation to a
   staging network and shares the bytecode hash with all consortium members.
2. **Review** — Each member independently verifies the bytecode matches the
   audited source code.
3. **Approval** — Multisig threshold reached (e.g., 3-of-5 consortium members).
4. **Execution** — Multisig calls `upgradeToAndCall()` on the proxy.
5. **Verification** — All members confirm state integrity post-upgrade.

## AidSettlement Upgrade Reference

```solidity
// V1 deployment
AidSettlementUpgradeable impl = new AidSettlementUpgradeable();
ERC1967Proxy proxy = new ERC1967Proxy(
    address(impl),
    abi.encodeCall(impl.initialize, (admin))
);

// V2 upgrade (owner or multisig)
AidSettlementV2 v2 = new AidSettlementV2();
AidSettlementUpgradeable(address(proxy)).upgradeToAndCall(
    address(v2),
    abi.encodeCall(v2.initializeV2, ())
);
```

## When NOT to Use a Proxy

- **Stateless utility contracts** — Pure computation or event-emission contracts
  that hold no meaningful state. Redeployment is simpler.
- **Single-use settlement** — If the contract processes a finite set of
  transactions and is then archived, upgradeability adds unnecessary complexity.
- **Immutability is a feature** — When trust requires that the contract logic
  can never change (e.g., locked escrow).
