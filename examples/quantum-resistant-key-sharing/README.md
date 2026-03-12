# Quantum-Resistant Key Sharing

Distributes a signing key across five nodes using Shamir threshold secret sharing. Any three shares reconstruct the key; fewer reveal nothing.

## What it demonstrates

- Shamir threshold secret sharing (3-of-5).
- Below-threshold reconstruction denial.
- Hash-ladder anchoring (SHA-256 chains, no asymmetric keys).

## Run

```bash
npm run example:quantum-key-sharing
```
