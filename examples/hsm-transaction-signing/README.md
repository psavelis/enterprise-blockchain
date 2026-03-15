# HSM Transaction Signing

Apex Capital trader Alice signs an equity buy order for submission to a consortium
fixed-income DLT venue. The EC P-256 private key never leaves the HSM boundary;
counterparties verify using the channel-MSP-published public key.

## What it demonstrates

- EC P-256 key generation on a named HSM slot with an opaque private-key handle.
- ECDSA-SHA256 signing of a structured trade order payload.
- Signature verification by a counterparty MSP (MeridianBankMSP).
- Tamper detection: a modified `quantity` field invalidates the original signature.
- Append-only HSM audit log covering every cryptographic operation.

## Run

```
npm run example:hsm-tx-signing
```
