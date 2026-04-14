/**
 * HSM Real PKCS#11 Example
 *
 * Demonstrates the HsmClient with real PKCS#11 hardware HSM support.
 * Falls back to simulator mode if SoftHSM2 is not available.
 *
 * Features demonstrated:
 * - EC P-256, P-384 key generation and ECDSA signing
 * - Ed25519 key generation and EdDSA signing
 * - RSA-4096 key generation and RSA-PSS signing
 * - AES-256 key generation and envelope encryption
 *
 * Prerequisites for PKCS#11 mode:
 * 1. Install SoftHSM2: apt-get install softhsm2
 * 2. Initialize a token: softhsm2-util --init-token --slot 0 --label "test" --so-pin 1234567890 --pin 1234
 * 3. Set environment variables:
 *    - HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so
 *    - HSM_PIN=1234
 *
 * Or use Docker:
 *   cd infra/softhsm2 && docker compose up -d
 *
 * Run: tsx examples/hsm-real-pkcs11/index.ts
 */

import { existsSync } from "node:fs";
import { HsmClient, type Pkcs11CryptoConfig } from "../../modules/hsm/src";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// Common SoftHSM2 library paths by OS
const SOFTHSM2_PATHS = [
  "/usr/lib/softhsm/libsofthsm2.so", // Debian/Ubuntu
  "/usr/local/lib/softhsm/libsofthsm2.so", // macOS (brew)
  "/opt/homebrew/lib/softhsm/libsofthsm2.so", // macOS ARM (brew)
  "/usr/lib64/pkcs11/libsofthsm2.so", // RHEL/CentOS
  process.env.HSM_LIBRARY_PATH ?? "",
].filter(Boolean);

function findSoftHsm2Library(): string | undefined {
  for (const path of SOFTHSM2_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Example
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    "╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║        HSM Real PKCS#11 Example                              ║",
  );
  console.log(
    "║        EC P-256/P-384, Ed25519, RSA-4096, AES-256           ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );

  const hsm = new HsmClient();
  const softHsmPath = findSoftHsm2Library();
  const userPin = process.env.HSM_PIN ?? "1234";

  if (softHsmPath) {
    console.log(`[INFO] Found SoftHSM2 at: ${softHsmPath}`);
    console.log("[INFO] Initializing in PKCS#11 mode...\n");

    const pkcs11Config: Pkcs11CryptoConfig = {
      type: "pkcs11",
      libraryPath: softHsmPath,
      slotIndex: 0,
      userPin,
    };

    try {
      await hsm.initializeAsync({
        slotId: "slot-0",
        label: "PKCS#11 Demo HSM",
        crypto: pkcs11Config,
      });
      console.log("[OK] PKCS#11 mode initialized successfully\n");
    } catch (error) {
      console.log(
        `[WARN] PKCS#11 initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log("[INFO] Falling back to simulator mode...\n");
      hsm.initialize({ slotId: "slot-0", label: "Simulator Demo HSM" });
    }
  } else {
    console.log("[INFO] SoftHSM2 not found, using simulator mode...");
    console.log("[TIP] Set HSM_LIBRARY_PATH to your PKCS#11 library path\n");
    hsm.initialize({ slotId: "slot-0", label: "Simulator Demo HSM" });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. EC P-256 Key Generation and Signing
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("1. EC P-256 Key Pair (ECDSA-SHA256)");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const ecP256Key = await hsm.generateKeyPairAsync("ec-p256-key", {
    keyType: "EC",
    namedCurve: "P-256",
  });
  console.log(`[KEY] Generated: ${ecP256Key.keyLabel}`);
  console.log(`      Type: ${ecP256Key.keyType} ${ecP256Key.namedCurve}`);
  console.log(`      Handle: ${ecP256Key.privateKeyHandle.slice(0, 40)}...`);

  const ecP256Data = "Transaction data for EC P-256 signing";
  const ecP256Sig = await hsm.signAsync(
    "ec-p256-key",
    ecP256Data,
    "ecdsa-sha256",
  );
  console.log(`[SIG] Algorithm: ${ecP256Sig.algorithm}`);
  console.log(`      Signature: ${ecP256Sig.signature.slice(0, 40)}...`);

  const ecP256Valid = await hsm.verifyAsync(
    "ec-p256-key",
    ecP256Data,
    ecP256Sig.signature,
    "ecdsa-sha256",
  );
  console.log(`[VRF] Verification: ${ecP256Valid ? "VALID ✓" : "INVALID ✗"}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. EC P-384 Key Generation and Signing
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("2. EC P-384 Key Pair (ECDSA-SHA384)");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const ecP384Key = await hsm.generateKeyPairAsync("ec-p384-key", {
    keyType: "EC",
    namedCurve: "P-384",
  });
  console.log(`[KEY] Generated: ${ecP384Key.keyLabel}`);
  console.log(`      Type: ${ecP384Key.keyType} ${ecP384Key.namedCurve}`);

  const ecP384Data = "High-security transaction for P-384";
  const ecP384Sig = await hsm.signAsync(
    "ec-p384-key",
    ecP384Data,
    "ecdsa-sha384",
  );
  console.log(`[SIG] Algorithm: ${ecP384Sig.algorithm}`);
  console.log(`      Signature: ${ecP384Sig.signature.slice(0, 40)}...`);

  const ecP384Valid = await hsm.verifyAsync(
    "ec-p384-key",
    ecP384Data,
    ecP384Sig.signature,
    "ecdsa-sha384",
  );
  console.log(`[VRF] Verification: ${ecP384Valid ? "VALID ✓" : "INVALID ✗"}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Ed25519 Key Generation and EdDSA Signing
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("3. Ed25519 Key Pair (EdDSA)");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const ed25519Key = await hsm.generateKeyPairAsync("ed25519-key", {
    keyType: "Ed",
    namedCurve: "Ed25519",
  });
  console.log(`[KEY] Generated: ${ed25519Key.keyLabel}`);
  console.log(`      Type: ${ed25519Key.keyType} ${ed25519Key.namedCurve}`);

  const edData = "Fast EdDSA signing for blockchain";
  const edSig = await hsm.signAsync("ed25519-key", edData, "ed25519");
  console.log(`[SIG] Algorithm: ${edSig.algorithm}`);
  console.log(`      Signature: ${edSig.signature.slice(0, 40)}...`);

  const edValid = await hsm.verifyAsync(
    "ed25519-key",
    edData,
    edSig.signature,
    "ed25519",
  );
  console.log(`[VRF] Verification: ${edValid ? "VALID ✓" : "INVALID ✗"}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. RSA-4096 Key Generation and RSA-PSS Signing
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("4. RSA-4096 Key Pair (RSA-PSS-SHA256)");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const rsaKey = await hsm.generateKeyPairAsync("rsa-4096-key", {
    keyType: "RSA",
    rsaBits: 4096,
  });
  console.log(`[KEY] Generated: ${rsaKey.keyLabel}`);
  console.log(`      Type: ${rsaKey.keyType} ${rsaKey.rsaBits}-bit`);

  const rsaData = "Document hash for RSA signing";
  const rsaSig = await hsm.signAsync("rsa-4096-key", rsaData, "rsa-pss-sha256");
  console.log(`[SIG] Algorithm: ${rsaSig.algorithm}`);
  console.log(`      Signature: ${rsaSig.signature.slice(0, 40)}...`);

  const rsaValid = await hsm.verifyAsync(
    "rsa-4096-key",
    rsaData,
    rsaSig.signature,
    "rsa-pss-sha256",
  );
  console.log(`[VRF] Verification: ${rsaValid ? "VALID ✓" : "INVALID ✗"}\n`);

  // ─────────────────────────────────────────────────────────────────────────
  // 5. AES-256 KEK and Envelope Encryption
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("5. AES-256 KEK and Envelope Encryption");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  await hsm.generateSymmetricKeyAsync("master-kek", { keyBits: 256 });
  console.log("[KEK] Generated: master-kek (AES-256)");

  const sensitiveData = JSON.stringify({
    accountId: "ACC-123456",
    balance: 1000000,
    currency: "USD",
    timestamp: new Date().toISOString(),
  });

  const encrypted = await hsm.encryptWithEnvelopeAsync(
    "master-kek",
    sensitiveData,
  );
  console.log("[ENC] Encrypted sensitive data:");
  console.log(
    `      Ciphertext: ${encrypted.encryptedRecord.ciphertext.slice(0, 40)}...`,
  );
  console.log(
    `      Wrapped DEK: ${encrypted.wrappedDek.wrappedDek.slice(0, 40)}...`,
  );

  const decrypted = await hsm.decryptWithEnvelopeAsync(
    encrypted.wrappedDek,
    encrypted.encryptedRecord,
  );
  console.log(`[DEC] Decrypted: ${decrypted.slice(0, 50)}...`);
  console.log(
    `[VRF] Roundtrip: ${decrypted === sensitiveData ? "SUCCESS ✓" : "FAILED ✗"}\n`,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Audit Log
  // ─────────────────────────────────────────────────────────────────────────
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );
  console.log("6. Audit Log Summary");
  console.log(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  );

  const auditLog = hsm.getAuditLog();
  console.log(`[LOG] Total entries: ${auditLog.length}`);

  const operations = new Map<string, number>();
  for (const entry of auditLog) {
    operations.set(entry.operation, (operations.get(entry.operation) ?? 0) + 1);
  }

  for (const [op, count] of operations) {
    console.log(`      - ${op}: ${count}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n[INFO] Finalizing HSM session...");
  await hsm.finalizeAsync();

  console.log(
    "\n╔══════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║                    Example Complete                          ║",
  );
  console.log(
    "║                                                              ║",
  );
  console.log(
    "║  All key types and operations demonstrated successfully.    ║",
  );
  console.log(
    "║                                                              ║",
  );
  console.log(
    "║  For real PKCS#11 HSM support:                              ║",
  );
  console.log(
    "║  1. Install SoftHSM2 or use a hardware HSM                  ║",
  );
  console.log(
    "║  2. Set HSM_LIBRARY_PATH and HSM_PIN environment vars       ║",
  );
  console.log(
    "║  3. Use initializeAsync() with Pkcs11CryptoConfig           ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════╝\n",
  );
}

main().catch((error) => {
  console.error("Example failed:", error);
  process.exit(1);
});
