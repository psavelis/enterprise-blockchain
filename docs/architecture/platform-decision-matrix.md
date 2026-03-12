# Platform Decision Matrix

This page maps the repository case studies to plausible enterprise blockchain platforms and outlines the tradeoffs.

| Scenario                    | Primary Need                                                          | Recommended Platform       | Why It Fits                                                                                      | Alternate Option                 | Notes                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Food recall response        | Multi-party provenance, deterministic finality, private supplier data | Hyperledger Fabric         | Strong consortium model, endorsement policies, private data collections, immediate finality      | Besu                             | Fabric is usually the cleaner fit when retailers, carriers, and suppliers need scoped sharing with clear organizational boundaries. |
| Consortium order sharing    | Selective disclosure across buyer, supplier, bank, regulator          | Hyperledger Besu           | EVM compatibility plus privacy groups fit financial and consortium workflows well                | Hyperledger Fabric               | Besu is attractive when consortium members want Ethereum tooling and smart-contract interoperability.                               |
| Hospital staffing clearance | Controlled bilateral sharing, regulated identity, minimal broadcast   | R3 Corda                   | Point-to-point data distribution and workflow-oriented states align with credential verification | Hyperledger Fabric               | Corda can be a better operational fit when only directly involved parties should see each transaction.                              |
| Aid voucher reconciliation  | Auditability, settlement controls, regulator visibility               | Hyperledger Besu or Fabric | Both support consortium governance and predictable settlement flows                              | Managed database plus signatures | Blockchain is justified only when multiple organizations need a shared source of truth without a fully trusted operator.            |

## Selection Heuristics

1. Choose Fabric when organizational endorsement rules and private collections are first-class requirements.
2. Choose Besu when Ethereum tooling, EVM contracts, or privacy groups are strategically important.
3. Choose Corda when transactions should be shared only with parties that need to know.
4. Do not force blockchain into a problem that can be solved with a single trusted system of record.

## Mapping to This Repository

- `modules/traceability/` aligns naturally with endorsement-driven workflows.
- `modules/privacy/` maps well to privacy groups and hashed record anchoring.
- `modules/credentialing/` covers a domain that often benefits from point-to-point disclosure rather than broad replication.
- `modules/aid-settlement/` highlights governance and reconciliation controls, where the platform choice depends more on the operating model than the code itself.
