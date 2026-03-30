# Security Policy

As a repository focused on **Sovereign Platform Engineering** and **Post-Quantum Cryptography (PQC)**, security is the core foundation of this project. Given that we are implementing NIST-standard algorithms like **ML-KEM** and **ML-DSA**, we maintain a rigorous stance on vulnerability management.

---

## Supported Versions

We prioritize the development of "Quantum-Safe" and "Collapse-Resilient" infrastructure. Support is focused on the current active development cycle to ensure all cryptographic primitives remain agile.

| Version           | Supported          | Status                                                  |
| :---------------- | :----------------- | :------------------------------------------------------ |
| **v1.x (Main)**   | :white_check_mark: | **Active** - NIST-standard PQC & Hexagonal Architecture |
| **v0.x (Legacy)** | :x:                | **Deprecated** - Early Alpha Proofs of Concept          |

---

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.** To protect the integrity of the sovereign stack and its users, we follow a coordinated disclosure model. If you discover a potential security flaw, please follow this protocol:

### 1. Private Disclosure

Send a detailed report to **savelis.pedro@outlook.com**.

### 2. What to Include

To help us prioritize your report, please provide:

- A description of the vulnerability (e.g., cryptographic bypass, logic error in Account Abstraction, or dependency flaw).
- A **Proof of Concept (PoC)** or clear steps to reproduce the issue.
- The potential impact on the decentralized infrastructure.

### 3. Our Commitment

- **Acknowledgment:** You will receive a response within **48 hours**.
- **Evaluation:** We will provide a technical assessment and a planned fix timeline within **5 business days**.
- **Recognition:** With your permission, we will credit you in our security advisories and release notes. We value the expertise of senior researchers who help harden this infrastructure.

---

## Security Principles of This Repo

- **Crypto-Agility:** We design for the rapid rotation of cryptographic primitives.
- **Boundary Enforcement:** We use **Hexagonal Architecture** to isolate core logic from external adapters, reducing the blast radius of any single vulnerability.
- **Zero-Trust Logic:** All state transitions, especially in **DePIN** and **RWA** pipelines, are treated as untrusted until cryptographically verified.

---

## Software Bill of Materials (SBOM)

We provide CycloneDX SBOM generation for supply chain transparency:

```bash
npm run sbom
```

This generates `sbom.json` in CycloneDX format, documenting all direct and transitive dependencies. The SBOM is:

- Generated on-demand via the command above
- Included as an artifact in GitHub Releases
- Useful for compliance audits and vulnerability correlation

For questions about specific dependencies, reference the SBOM or run `npm ls <package>`.
