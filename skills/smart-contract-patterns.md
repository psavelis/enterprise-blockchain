# Smart Contract Patterns

Solidity patterns for permissioned enterprise blockchains (Besu/QBFT).

## When to Use

- Implementing access control with role-based permissions
- Adding emergency stop (pause) capabilities
- Deploying upgradeable contracts via UUPS proxy
- Writing invariant tests with Foundry

## When NOT to Use

- Public mainnet contracts (different gas/security trade-offs)
- Simple data anchoring without access control
- Contracts requiring transparent proxy pattern

## Key Concepts

**AccessControl (OpenZeppelin)**: Role-based permission system. Roles defined as `bytes32` constants. Functions guarded with `onlyRole(ROLE)` modifier.

**Pausable**: Emergency stop pattern. Admin calls `pause()` to halt state-changing operations. `whenNotPaused` modifier guards protected functions. View functions remain accessible.

**UUPS Proxy (ERC-1967)**: Upgradeable pattern where logic contract contains upgrade function. Uses ERC-7201 namespaced storage to prevent slot collisions.

**Invariant Testing**: Stateful fuzz testing. Handler contract exposes bounded actions. Fuzzer calls handler methods with random inputs. Invariant contract asserts properties that must always hold.

## Architecture

```
contracts/solidity/
├── src/
│   ├── AidSettlement.sol           → Non-upgradeable, AccessControl + Pausable
│   ├── AidSettlementUpgradeable.sol → UUPS upgradeable version
│   ├── ConsortiumOrderRegistry.sol  → Order anchoring with privacy groups
│   └── TraceabilityAnchor.sol       → Cross-chain lot verification
├── test/
│   ├── AidSettlement.t.sol
│   ├── AidSettlementUpgrade.t.sol
│   ├── ConsortiumOrderRegistry.t.sol
│   ├── TraceabilityAnchor.t.sol
│   └── invariants/
│       ├── AidSettlementHandler.sol
│       └── AidSettlementInvariant.sol
└── lib/
    ├── forge-std/
    ├── openzeppelin-contracts/
    └── openzeppelin-contracts-upgradeable/
```

## Contract Inventory

| Contract                     | Purpose                       | Patterns                    | Test Coverage    |
| ---------------------------- | ----------------------------- | --------------------------- | ---------------- |
| AidSettlement.sol            | Humanitarian aid disbursement | AccessControl, Pausable     | 23 unit tests    |
| AidSettlementUpgradeable.sol | Upgradeable version           | UUPS, Initializable         | 15 upgrade tests |
| ConsortiumOrderRegistry.sol  | Order hash anchoring          | AccessControl, events       | 18 unit tests    |
| TraceabilityAnchor.sol       | Cross-chain lot verification  | Oracle registry, signatures | 12 unit tests    |

## Implementation Patterns

### Access Control Setup

```solidity
bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

constructor(address admin) {
    require(admin != address(0), "admin is the zero address");
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(PAUSER_ROLE, admin);
}

function anchorLot(...) external onlyRole(ANCHOR_ROLE) whenNotPaused {
    // ...
}
```

### UUPS Upgrade Pattern

```solidity
contract V1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

### Invariant Test Structure

```solidity
contract Handler {
    Target target;
    constructor(Target _target) { target = _target; }

    function doAction(uint256 input) external {
        target.action(bound(input, 0, 100));
    }
}

contract Invariant is Test {
    Handler handler;
    Target target;

    function setUp() public {
        target = new Target();
        handler = new Handler(target);
        targetContract(address(handler));
    }

    function invariant_propertyHolds() external view {
        assertLe(target.consumed(), target.budget());
    }
}
```

## Security Constraints

| Constraint            | Implementation                                              |
| --------------------- | ----------------------------------------------------------- |
| Zero-address admin    | `require(admin != address(0), "admin is the zero address")` |
| Re-entrancy           | Checks-effects-interactions pattern                         |
| Integer overflow      | Solidity 0.8+ built-in checks                               |
| Upgrade authorization | `onlyOwner` in `_authorizeUpgrade`                          |
| Initialization replay | `_disableInitializers()` in constructor                     |

## Must-Preserve Invariants

1. **Zero-address validation**: All admin/owner parameters validated in constructor
2. **Role separation**: PAUSER_ROLE distinct from ANCHOR_ROLE distinct from DEFAULT_ADMIN_ROLE
3. **Pause scope**: Only state-changing functions check `whenNotPaused`; views always accessible
4. **Upgrade safety**: UUPS contracts call `_disableInitializers()` in constructor
5. **Test coverage**: All public functions have corresponding unit tests

## Anti-patterns

**Zero-address admin in constructor**: Locks contract permanently. Always validate:

```solidity
require(admin != address(0), "admin is the zero address");
```

**Forgetting `_disableInitializers()`**: UUPS implementation contract can be initialized by attacker. Call in constructor to prevent.

**Direct fuzzer-to-contract calls**: Fuzzer generates random calldata. Use handler contract to mediate and bound inputs.

**npm for OpenZeppelin**: Foundry resolves dependencies from `lib/`. Use:

```bash
forge install OpenZeppelin/openzeppelin-contracts
```

**Mixing storage layouts in upgrades**: Adding storage variables in wrong position corrupts state. Use ERC-7201 namespaced storage or append-only slots.

**View functions checking `whenNotPaused`**: Emergency pause should not block reads. Only guard state-changing functions.

## Foundry Commands

```bash
forge build                    # Compile
forge test                     # Run all tests (91 tests)
forge test --match-test test_  # Run unit tests only
forge test --match-contract Invariant  # Run invariant tests
forge coverage                 # Coverage report
forge fmt                      # Format code
```

## Related Skills

- [platform-selection](platform-selection.md) — When to use Besu vs Fabric
- [integration-adapters](integration-adapters.md) — Deploying via Besu client

## References

- `contracts/solidity/src/AidSettlement.sol`
- `contracts/solidity/src/AidSettlementUpgradeable.sol`
- `contracts/solidity/src/ConsortiumOrderRegistry.sol`
- `contracts/solidity/src/TraceabilityAnchor.sol`
- `contracts/solidity/test/invariants/`
- `docs/architecture/contract-upgrade-patterns.md`
