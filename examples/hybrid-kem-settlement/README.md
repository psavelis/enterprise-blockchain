# Hybrid KEM Settlement Example

## What this is

A production-grade cross-border FX settlement key exchange using **Hybrid KEM** — combining X25519 (classical ECDH) with **ML-KEM-768** (NIST FIPS 203 post-quantum). The hybrid pattern is how real systems should be built during the current post-quantum transition period.

## Why hybrid instead of pure ML-KEM

Two risks sit in tension right now:

| Risk                                          | Threat source                | Mitigation     |
| --------------------------------------------- | ---------------------------- | -------------- |
| Future quantum computers break classical ECDH | Shor's algorithm on a CRQC   | Add ML-KEM-768 |
| ML-KEM is newer with less public scrutiny     | Unknown future cryptanalysis | Keep X25519    |

A hybrid KEM is secure as long as **at least one** component remains unbroken. An attacker must simultaneously break both X25519 _and_ ML-KEM to recover the combined key — the "break-both" requirement.

## Real-world deployments using this pattern

- **Chrome/Chromium** — X25519Kyber768 experiment shipped to stable channel, August 2023  
  https://blog.chromium.org/2023/08/protecting-chrome-traffic-with-hybrid.html
- **Cloudflare** — Deployed ML-KEM + X25519 hybrid for TLS 1.3 in 2023
- **Signal** — PQXDH specification (X25519 + Kyber for post-quantum forward secrecy)  
  https://signal.org/docs/specifications/pqxdh/
- **IETF** — draft-ietf-tls-hybrid-design formalises the construction  
  https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/

## Construction

```
ikm  = x25519_shared_secret ∥ kyber_shared_secret
key  = HKDF-SHA256(ikm, salt=0x00…, info="hybrid-kem-v1", length=32)
```

Both secrets are concatenated _before_ HKDF so neither dominates. A domain-separation label (`hybrid-kem-v1`) prevents the same key material from being reused in a different context.

## Wire format

The sender transmits three items (no secrets):

```
transmit: [x25519_ephemeral_public_key_der]  ← 44 bytes (SPKI DER for X25519)
          [kyber_ciphertext]                 ← 1088 bytes (ML-KEM-768)
          [aes_iv + aes_tag + ciphertext]    ← payload-length dependent
```

The receiver has their long-term `x25519_private_key` and `kyber_secret_key` and uses them to independently reconstruct the same `combinedKey`.

## Harvest-now, decrypt-later threat

Adversaries today are collecting and storing TLS-encrypted traffic, betting that quantum computers capable of running Shor's algorithm will be available within 10–20 years. Financial records, clinical data, and strategic communications encrypted today could be exposed retroactively.

By switching to a hybrid KEM now:

- Today's ECDH-encrypted channels are protected against recorded quantum decryption
- ML-KEM's lattice foundation remains unbroken even if a CRQC appears tomorrow
- If a major ML-KEM cryptanalytic break is published, X25519 still protects the channel

## Run

```bash
npm run example:hybrid-kem
```

## ML-KEM standard

NIST FIPS 203 (finalised August 2024): https://csrc.nist.gov/pubs/fips/203/final

See also [docs/architecture/mpc-quantum-resistance.md](../../docs/architecture/mpc-quantum-resistance.md) for the full architecture context.
