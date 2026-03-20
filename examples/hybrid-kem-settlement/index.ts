/**
 * Hybrid KEM Settlement — X25519 + ML-KEM-768
 *
 * Scenario: Same Leet Gaming Global Bank → Leet Gaming Settlement Corp FX settlement, but now using
 * a production-grade hybrid KEM instead of ML-KEM alone.
 *
 * During the post-quantum transition period (which the industry is navigating
 * right now), two risks sit in tension:
 *
 *   1. Future quantum threat (CRQC): pure ECDH is eventually vulnerable
 *   2. New PQ algorithms: ML-KEM is newer and has had fewer years of public
 *      cryptanalysis than ECDH (standardised in 1999, ~25 years of scrutiny)
 *
 * A hybrid KEM addresses both by requiring an attacker to break *both*
 * channels simultaneously.  This is the same approach used in:
 *
 *   - Chrome/Chromium X25519Kyber768 (2023–2024 experiment)
 *     https://blog.chromium.org/2023/08/protecting-chrome-traffic-with-hybrid.html
 *   - Cloudflare TLS 1.3 post-quantum deployment
 *   - IETF draft-ietf-tls-hybrid-design
 *     https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/
 *   - Signal Protocol's PQXDH (X25519 + Kyber for forward secrecy)
 *     https://signal.org/docs/specifications/pqxdh/
 *
 * Standard: NIST FIPS 203 — https://csrc.nist.gov/pubs/fips/203/final
 *
 * Run: npm run example:hybrid-kem
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { HybridKem } from "../../modules/mpc/src/hybrid-kem";

// ---------------------------------------------------------------------------
// Settlement payload
// ---------------------------------------------------------------------------

interface SettlementInstruction {
  instructionId: string;
  originatingBank: { name: string; bic: string };
  receivingBank: { name: string; bic: string };
  currencyPair: string;
  notionalEur: number;
  fxRate: number;
  settlementDate: string;
  swiftRef: string;
  correspondentChain: string[];
  channel: string;
  timestamp: string;
}

const SETTLEMENT: SettlementInstruction = {
  instructionId: "MGB-NPY-2026-03-20-FX-HYBRID-001",
  originatingBank: { name: "Leet Gaming Global Bank AG", bic: "MRGBDEFF" },
  receivingBank: { name: "Leet Gaming Settlement Corp", bic: "NOVAJPJT" },
  currencyPair: "EUR/JPY",
  notionalEur: 50_000_000,
  fxRate: 162.34,
  settlementDate: "2026-03-22",
  swiftRef: "MGB20260320EUR50M-HYBRID",
  correspondentChain: [
    "MRGBDEFF (Leet Gaming, Frankfurt)",
    "DEUTDEDB (Deutsche Bank, Frankfurt — EUR leg)",
    "BOTKJPJT (MUFG Bank, Tokyo — JPY leg)",
    "NOVAJPJT (Leet Gaming SC, Tokyo)",
  ],
  channel: "hybrid-x25519-ml-kem-768",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

function encrypt(key: Buffer, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: enc.toString("hex"),
  };
}

function decrypt(
  key: Buffer,
  iv: string,
  tag: string,
  ciphertext: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return (
    decipher.update(Buffer.from(ciphertext, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}

// ---------------------------------------------------------------------------
// Main demonstration
// ---------------------------------------------------------------------------

const hybridKem = new HybridKem();
const section = (title: string) => console.log(`\n── ${title}`);

console.log("Hybrid KEM Settlement — X25519 + ML-KEM-768 (NIST FIPS 203)");
console.log("Leet Gaming Global Bank → Leet Gaming Settlement Corp");
console.log(
  "combinedKey = HKDF-SHA256( x25519_secret || kyber_secret )  — attacker must break both channels\n",
);

// --- Step 1: Leet Gaming SC generates long-term key pairs ---
section("Step 1 — Leet Gaming SC: generate long-term key pairs");

const novaPayKeys = hybridKem.generateKeyPairs();

console.log(
  `   X25519 pk=32 B (classical)  ML-KEM-768 pk=${novaPayKeys.kyber.publicKey.length} B (post-quantum)  — both published to directory\n`,
);

// --- Step 2: Leet Gaming encapsulates both channels ---
section("Step 2 — Leet Gaming: encapsulate session key via both channels");

const encap = hybridKem.encapsulate(
  novaPayKeys.x25519.publicKey,
  novaPayKeys.kyber.publicKey,
);

// Encrypt the settlement instruction with the combined key
const encrypted = encrypt(encap.combinedKey, JSON.stringify(SETTLEMENT));
console.log(
  `   X25519 eph=${encap.x25519EphemeralPublicKeyDer.length} B  ML-KEM-768 ct=${encap.kyberCiphertext.length} B  combined key=32 B (not transmitted)`,
);
console.log(
  `   payload=${encrypted.ciphertext.length / 2} B  commitment=${encap.auditCommitment}\n`,
);

// --- Step 3: Leet Gaming SC decapsulates ---
section("Step 3 — Leet Gaming SC: decapsulate and decrypt");

const decap = hybridKem.decapsulate(
  novaPayKeys.x25519.privateKey,
  novaPayKeys.kyber.secretKey,
  encap.x25519EphemeralPublicKeyDer,
  encap.kyberCiphertext,
);

const decrypted = JSON.parse(
  decrypt(decap.combinedKey, encrypted.iv, encrypted.tag, encrypted.ciphertext),
) as SettlementInstruction;

const keysMatch = encap.combinedKey.equals(decap.combinedKey);
const payloadMatch =
  decrypted.instructionId === SETTLEMENT.instructionId &&
  decrypted.notionalEur === SETTLEMENT.notionalEur;

console.log(
  `   keys=${keysMatch ? "✓" : "✗"}  payload=${payloadMatch ? "✓" : "✗"}  ${decrypted.instructionId}  €${decrypted.notionalEur.toLocaleString()} @ ${decrypted.fxRate}`,
);
console.log(`   channel: ${decrypted.channel}\n`);

// --- Step 4: Demonstrate break-both security property ---
section("Step 4 — Security property: break-both requirement");

// Case A: Attacker compromises only the classical X25519 channel
// (e.g., a CRQC running Shor's algorithm on the ephemeral public key)
const attackerKeys = hybridKem.generateKeyPairs(); // wrong keys entirely

const decapWrongX25519 = hybridKem.decapsulate(
  attackerKeys.x25519.privateKey, // wrong X25519 private key
  novaPayKeys.kyber.secretKey, // correct ML-KEM key
  encap.x25519EphemeralPublicKeyDer,
  encap.kyberCiphertext,
);

// Case B: Attacker compromises only the post-quantum ML-KEM channel
const decapWrongKyber = hybridKem.decapsulate(
  novaPayKeys.x25519.privateKey, // correct X25519 key
  attackerKeys.kyber.secretKey, // wrong ML-KEM key
  encap.x25519EphemeralPublicKeyDer,
  encap.kyberCiphertext,
);

const wrongX25519Match = decapWrongX25519.combinedKey.equals(encap.combinedKey);
const wrongKyberMatch = decapWrongKyber.combinedKey.equals(encap.combinedKey);

console.log(
  `   wrong X25519, correct ML-KEM: ${wrongX25519Match ? "✗" : "✓ combined key differs"}`,
);
console.log(
  `   correct X25519, wrong ML-KEM: ${wrongKyberMatch ? "✗" : "✓ combined key differs"}\n`,
);

section("Summary");
console.log(
  `   ${SETTLEMENT.instructionId}  €${SETTLEMENT.notionalEur.toLocaleString()} EUR/JPY`,
);
console.log(
  `   X25519 (32 B) + ML-KEM-768 (${novaPayKeys.kyber.publicKey.length} B)  →  HKDF-SHA256  →  32 B AES-256-GCM key`,
);
console.log(`   commitment=${encap.auditCommitment}`);
console.log(`   ${keysMatch && payloadMatch ? "✓" : "✗"}\n`);
