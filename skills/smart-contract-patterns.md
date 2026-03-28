# Skill: Solidity Smart Contract Patterns

## When to use

When writing or reviewing Solidity contracts for permissioned enterprise blockchains (Besu/QBFT). Covers access control, emergency stops, upgradeability, and testing.

## Key concepts

- **AccessControl (OpenZeppelin)**: Role-based permission system. Each contract defines roles (e.g., `ANCHOR_ADMIN`, `CLAIM_SUBMITTER`) and guards state-changing functions with `onlyRole()`.
- **Pausable**: Emergency stop pattern. `pause()` / `unpause()` controlled by admin role. All state-changing functions check `whenNotPaused`.
- **UUPS Proxy (ERC-1967)**: Upgradeable contracts using ERC-7201 namespaced storage. The logic contract includes `_authorizeUpgrade()` restricted to owner. Deploy via `ERC1967Proxy`.
- **Invariant testing (Foundry)**: Stateful fuzz testing where a handler contract drives random operations and an invariant contract asserts properties that must always hold (e.g., consumed ≤ budget, settled + rejected == submitted).

## Implementation pattern

```
Constructor validation:
  if (admin == address(0)) revert ZeroAdminAddress();

Role setup:
  _grantRole(DEFAULT_ADMIN_ROLE, admin);
  _grantRole(SPECIFIC_ROLE, admin);

UUPS upgrade:
  contract V1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    function initialize(address owner) external initializer {
      __Ownable_init(owner);
      __UUPSUpgradeable_init();
    }
    function _authorizeUpgrade(address) internal override onlyOwner {}
  }

Invariant test:
  contract Handler { function doAction() external { ... } }
  contract Invariant is Test {
    function setUp() { targetContract(handler); }
    function invariant_property() external view { assert(condition); }
  }
```

## Pitfalls

- Always validate `admin != address(0)` in constructors — a zero-address admin locks the contract permanently.
- UUPS contracts must call `_disableInitializers()` in the constructor to prevent implementation contract initialization.
- Foundry invariant tests need a handler contract to mediate between the fuzzer and the target — don't let the fuzzer call the contract directly with random calldata.
- Use `forge install` for OpenZeppelin contracts, not npm — Foundry resolves dependencies from `lib/`.

## References

- `contracts/solidity/src/AidSettlement.sol`
- `contracts/solidity/src/ConsortiumOrderRegistry.sol`
- `contracts/solidity/src/TraceabilityAnchor.sol`
- `contracts/solidity/src/AidSettlementUpgradeable.sol`
- `contracts/solidity/test/invariants/`
- `docs/architecture/overview.md`
