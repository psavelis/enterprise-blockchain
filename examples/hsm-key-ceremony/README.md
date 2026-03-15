# HSM Key Ceremony

GlobalNet Consortium onboards Argent Bank through a formal root-key ceremony.
Five named custodians (CFO, CISO, General Counsel, Head of Ops, Infra Lead)
hold shares of a Shamir 3-of-5 threshold secret. Any three can reconstruct
to authorise future key-rotation events; no single custodian has unilateral authority.

## What it demonstrates

- EC P-256 root-key generation on a named consortium ceremony HSM slot.
- Shamir 3-of-5 threshold secret sharing of a ceremony seed across named custodians.
- Quorum reconstruction (CFO + CISO + Counsel) — succeeds and matches original.
- Below-threshold attempt (Ops + IT, 2-of-5) — returns `null`, reveals nothing.
- HSM-signed ceremony completion certificate for the governance record.
- Complementary use of `HsmClient` (key protection) and `QuantumResistantVault` (custodian threshold).

## Run

```
npm run example:hsm-key-ceremony
```
