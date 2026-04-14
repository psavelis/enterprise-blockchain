# HSM Real PKCS#11

Production-ready HSM integration using hardware PKCS#11 tokens via `graphene-pk11`.
Falls back to in-memory simulator if no HSM is available, enabling the same code
path for development and production.

## What it demonstrates

- **PKCS#11 hardware integration**: Real HSM support via SoftHSM2 or any PKCS#11-compliant device.
- **Simulator fallback**: Graceful degradation to software crypto when HSM unavailable.
- **Multi-algorithm support**: EC P-256/P-384 (ECDSA), Ed25519 (EdDSA), RSA-4096 (RSA-PSS/PKCS1).
- **AES-128/256 key wrapping**: Symmetric key generation and envelope encryption.
- **Async API**: All operations use the async `*Async()` methods for hardware compatibility.
- **Audit logging**: Complete operation trail for compliance.

## Prerequisites (PKCS#11 mode)

### Option 1: Docker (recommended)

```bash
cd infra/softhsm2
docker compose up -d
```

### Option 2: Native SoftHSM2

```bash
# Debian/Ubuntu
apt-get install softhsm2

# macOS
brew install softhsm

# Initialize token
softhsm2-util --init-token --slot 0 --label "test" --so-pin 1234567890 --pin 1234
```

Set environment variables:

```bash
export HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so
export HSM_PIN=1234
```

## Run

```bash
npm run example:hsm-pkcs11
```

The example automatically detects SoftHSM2 availability and falls back to simulator mode if not found.
