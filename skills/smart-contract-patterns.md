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

**AccessControl (OpenZeppelin)**: Role-based permission system. Roles defined as `bytes32` constants. Functions guarded with `onlyRole(ROLE)` modifier. Admin role manages role assignments.

**Pausable**: Emergency stop pattern. Admin calls `pause()` to halt state-changing operations. `whenNotPaused` modifier guards protected functions. View functions remain accessible.

**UUPS Proxy (ERC-1967)**: Upgradeable pattern where logic contract contains upgrade function. Uses ERC-7201 namespaced storage to prevent slot collisions. Proxy delegates all calls to implementation.

**Invariant Testing**: Stateful fuzz testing. Handler contract exposes actions. Fuzzer calls handler methods with random inputs. Invariant contract asserts properties that must always hold.

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

## Implementation Patterns

### Access Control Setup

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant SUBMITTER_ROLE = keccak256("SUBMITTER_ROLE");

constructor(address admin) {
    if (admin == address(0)) revert ZeroAdminAddress();
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(ADMIN_ROLE, admin);
}

function submitClaim(...) external onlyRole(SUBMITTER_ROLE) whenNotPaused {
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
        // Bound inputs, call target
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

| Constraint            | Implementation                          |
| --------------------- | --------------------------------------- |
| Zero-address admin    | Revert in constructor                   |
| Re-entrancy           | Checks-effects-interactions pattern     |
| Integer overflow      | Solidity 0.8+ built-in checks           |
| Upgrade authorization | `onlyOwner` in `_authorizeUpgrade`      |
| Initialization replay | `_disableInitializers()` in constructor |

## Anti-patterns

**Zero-address admin in constructor**: Locks contract permanently. Always validate: `if (admin == address(0)) revert ZeroAdminAddress();`

**Forgetting `_disableInitializers()`**: UUPS implementation contract can be initialized by attacker. Call in constructor to prevent.

**Direct fuzzer-to-contract calls**: Fuzzer generates random calldata. Use handler contract to mediate and bound inputs.

**npm for OpenZeppelin**: Foundry resolves dependencies from `lib/`. Use `forge install OpenZeppelin/openzeppelin-contracts`.

**Mixing storage layouts in upgrades**: Adding storage variables in wrong position corrupts state. Use ERC-7201 namespaced storage or append-only slots.

**View functions checking `whenNotPaused`**: Emergency pause should not block reads. Only guard state-changing functions.

## Foundry Commands

```bash
forge build                    # Compile
forge test                     # Run all tests
forge test --match-test test_  # Run unit tests
forge test --match-contract Invariant  # Run invariant tests
forge coverage                 # Coverage report
forge fmt                      # Format code
```

## References

- `contracts/solidity/src/AidSettlement.sol`
- `contracts/solidity/src/AidSettlementUpgradeable.sol`
- `contracts/solidity/src/ConsortiumOrderRegistry.sol`
- `contracts/solidity/src/TraceabilityAnchor.sol`
- `contracts/solidity/test/invariants/`
- `docs/architecture/contract-upgrade-patterns.md`
