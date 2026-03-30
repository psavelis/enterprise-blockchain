# Skills Coverage Analysis

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SKILLS LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   PLATFORM      │    │   INTEGRATION   │    │ SMART CONTRACT  │          │
│  │   SELECTION     │───▶│    ADAPTERS     │◀───│    PATTERNS     │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           │ selects              │ implements           │ deployed to        │
│           ▼                      ▼                      ▼                    │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      PROTOCOL ADAPTERS                           │        │
│  │   modules/protocols/{besu,fabric,corda}/                         │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                           DOMAIN SKILLS                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │  TRACEABILITY   │    │   SELECTIVE     │    │      MPC        │          │
│  │    RECALL       │    │   DISCLOSURE    │    │ SECRET SHARING  │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           │                      │                      │                    │
│           └──────────────────────┼──────────────────────┘                    │
│                                  │                                           │
│                                  ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │    HSM KEY MANAGEMENT    │                              │
│                    │  (cross-cutting concern) │                              │
│                    └─────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Coverage Matrix

| Module Path                            | PS  | SD  | HSM | MPC | TR  | IA  | SC  |
| -------------------------------------- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `modules/protocols/besu/`              |  ✓  |     |     |     |     |     |     |
| `modules/protocols/fabric/`            |  ✓  |     |     |     |     |     |     |
| `modules/protocols/corda/`             |  ✓  |     |     |     |     |     |     |
| `modules/privacy/`                     |     |  ✓  |     |     |     |     |     |
| `modules/hsm/`                         |     |     |  ✓  |     |     |     |     |
| `modules/mpc/`                         |     |     |     |  ✓  |     |     |     |
| `modules/traceability/`                |     |     |     |     |  ✓  |     |     |
| `modules/integrations/besu-client/`    |     |     |     |     |     |  ✓  |     |
| `modules/integrations/fabric-gateway/` |     |     |     |     |     |  ✓  |     |
| `modules/integrations/corda-gateway/`  |     |     |     |     |     |  ✓  |     |
| `modules/integrations/shared/`         |     |     |     |     |     |  ✓  |     |
| `contracts/solidity/src/`              |     |     |     |     |  ✓  |     |  ✓  |
| `contracts/fabric/`                    |     |     |     |     |  ✓  |     |     |

**Legend**: PS=Platform Selection, SD=Selective Disclosure, HSM=HSM Key Management, MPC=MPC Secret Sharing, TR=Traceability Recall, IA=Integration Adapters, SC=Smart Contract Patterns

## Redundancy Analysis

### Cross-References (Overlapping Coverage)

| Overlap                  | Skills Involved | Resolution                                        |
| ------------------------ | --------------- | ------------------------------------------------- |
| `TraceabilityAnchor.sol` | TR + SC         | SC covers patterns; TR covers domain usage        |
| Protocol adapters        | PS + IA         | PS covers selection; IA covers implementation     |
| HSM signing              | HSM + SD + MPC  | HSM is dependency; SD/MPC reference, not document |
| Retry/circuit breaker    | IA only         | No redundancy                                     |

### Identified Redundancies

1. **Protocol descriptions duplicated**
   - `platform-selection.md` explains Besu/Fabric/Corda capabilities
   - `integration-adapters.md` explains same platforms' SDK patterns
   - **Fix**: Reference `platform-selection` from `integration-adapters` for protocol choice

2. **TraceabilityAnchor.sol documented twice**
   - `traceability-recall.md`: Domain perspective (lot anchoring, oracle role)
   - `smart-contract-patterns.md`: Pattern perspective (AccessControl, Pausable)
   - **Fix**: Keep both; different concerns

3. **HSM mentioned in multiple skills**
   - `hsm-key-management.md`: Full documentation
   - `selective-disclosure.md`: "SignedAuditProof" mentions HSM
   - `mpc-secret-sharing.md`: "Hash-ladder anchoring with HSM signatures"
   - **Fix**: SD and MPC should reference HSM skill, not re-explain

## Optimization Recommendations

### 1. Add Cross-Skill References

```markdown
# In selective-disclosure.md, Anti-patterns section:

**HSM Configuration**: See [hsm-key-management](hsm-key-management.md) for HSM setup.

# In mpc-secret-sharing.md, Security Properties section:

**Non-repudiation**: Requires HSM signing. See [hsm-key-management](hsm-key-management.md).

# In integration-adapters.md, When to Use section:

**Protocol Selection**: See [platform-selection](platform-selection.md) for Besu vs Fabric vs Corda decision criteria.
```

### 2. Consolidate Retry/Resilience Patterns

Current: Only in `integration-adapters.md`
Recommendation: **Keep as-is** (single source of truth)

### 3. Missing Coverage

| Gap                       | Recommendation                               |
| ------------------------- | -------------------------------------------- |
| Post-quantum cryptography | Add PQC skill or extend `mpc-secret-sharing` |
| Aid settlement domain     | Add skill or fold into `traceability-recall` |
| Credentialing/clearance   | Add skill for hospital staffing use case     |

## Skill Dependency Graph

```
                    platform-selection
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    integration-adapters   │    smart-contract-patterns
              │            │            │
              └────────────┼────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  traceability-recall  selective-disclosure  mpc-secret-sharing
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │
                           ▼
                   hsm-key-management
```

## Word Count Analysis

| Skill                   | Lines | Status |
| ----------------------- | ----- | ------ |
| platform-selection      | 75    | OK     |
| selective-disclosure    | 87    | OK     |
| hsm-key-management      | 99    | OK     |
| mpc-secret-sharing      | 115   | OK     |
| traceability-recall     | 112   | OK     |
| integration-adapters    | 137   | OK     |
| smart-contract-patterns | 160   | OK     |

All skills under 2,000 words target.
