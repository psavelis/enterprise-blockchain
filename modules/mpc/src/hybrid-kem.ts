/**
 * Hybrid KEM — X25519 + ML-KEM-768
 *
 * Why hybrid instead of ML-KEM alone?
 *
 * We are in a cryptographic transition period.  CRQCs capable of running
 * Shor's algorithm at scale do not yet exist, but quantum-safe algorithms are
 * newer and have had less time for public cryptanalysis than well-established
 * classical schemes.
 *
 * A hybrid KEM addresses both risks simultaneously:
 *   1. Classical channel (X25519) — secure against all known classical attacks
 *   2. Post-quantum channel (ML-KEM-768) — secure against quantum adversaries
 *
 * Both shared secrets are fed into HKDF together, so breaking the combined
 * key requires breaking *both* channels.  This matches how Chrome, Firefox, and
 * Cloudflare deployed post-quantum TLS during the 2023–2024 transition
 * (Google's X25519Kyber768 experiment: https://blog.chromium.org/2023/08/protecting-chrome-traffic-with-hybrid.html).
 *
 * The construction used here follows the approach described in:
 * IETF draft-ietf-tls-hybrid-design — https://datatracker.ietf.org/doc/draft-ietf-tls-hybrid-design/
 *
 * Standard for the PQ half: NIST FIPS 203 — https://csrc.nist.gov/pubs/fips/203/final
 */

import {
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { sha256hex } from "./crypto";
import type { KyberKeyPair } from "./kyber";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HybridKeyPairs {
  /** Ephemeral X25519 key pair (classical channel). */
  x25519: {
    publicKey: KeyObject;
    privateKey: KeyObject;
  };
  /** ML-KEM-768 key pair (post-quantum channel). */
  kyber: KyberKeyPair;
}

export interface HybridEncapsulation {
  /**
   * X25519 ephemeral public key in DER format.
   * The recipient uses this together with their X25519 private key to
   * reproduce the classical shared secret.
   */
  x25519EphemeralPublicKeyDer: Buffer;
  /** ML-KEM-768 ciphertext (post-quantum channel). */
  kyberCiphertext: Uint8Array;
  /**
   * The combined symmetric key derived from both channels.
   * 32 bytes — ready for use as an AES-256-GCM key.
   * Do not transmit; derive it independently on each side.
   */
  combinedKey: Buffer;
  /** SHA-256 of (x25519EphemeralPublicKeyDer || kyberCiphertext) for auditing. */
  auditCommitment: string;
}

export interface HybridDecapsulation {
  combinedKey: Buffer;
}

// ---------------------------------------------------------------------------
// HybridKem class
// ---------------------------------------------------------------------------

export class HybridKem {
  /**
   * Generate a fresh set of long-term recipient key pairs (one per channel).
   *
   * In production the X25519 and ML-KEM keys would live in separate HSM slots
   * and be rotated on independent schedules.  Here we generate both for
   * demonstration purposes.
   */
  generateKeyPairs(): HybridKeyPairs {
    const { publicKey, privateKey } = generateKeyPairSync("x25519");
    const { publicKey: kyberPub, secretKey: kyberSec } = ml_kem768.keygen();
    return {
      x25519: { publicKey, privateKey },
      kyber: { publicKey: kyberPub, secretKey: kyberSec, params: "ml-kem-768" },
    };
  }

  /**
   * Sender-side encapsulation.
   *
   * 1. Generate an ephemeral X25519 keypair and perform DH with the
   *    recipient's X25519 public key to get the classical shared secret.
   * 2. Encapsulate a fresh shared secret under the recipient's ML-KEM-768
   *    public key.
   * 3. Feed both shared secrets into HKDF together to produce one combined
   *    symmetric key.
   *
   * Only `x25519EphemeralPublicKeyDer` and `kyberCiphertext` are transmitted.
   * The `combinedKey` stays local and is used for encryption.
   */
  encapsulate(
    recipientX25519PublicKey: KeyObject,
    recipientKyberPublicKey: Uint8Array,
  ): HybridEncapsulation {
    // --- Classical channel ---
    const { privateKey: ephemeralPriv, publicKey: ephemeralPub } =
      generateKeyPairSync("x25519");

    const x25519SharedSecret = diffieHellman({
      privateKey: ephemeralPriv,
      publicKey: recipientX25519PublicKey,
    });

    // --- Post-quantum channel ---
    const { cipherText: kyberCiphertext, sharedSecret: kyberSharedSecret } =
      ml_kem768.encapsulate(recipientKyberPublicKey);

    // --- Combine both secrets via HKDF ---
    // Concatenating before HKDF means neither secret dominates — both must be
    // known to derive the output.  The domain-separator label prevents the
    // same key material being reused in a different context.
    const combinedKey = this.#combineSecrets(
      x25519SharedSecret,
      kyberSharedSecret,
    );

    const ephemeralPubDer = Buffer.from(
      ephemeralPub.export({ type: "spki", format: "der" }),
    );
    const auditCommitment = sha256hex(
      ephemeralPubDer.toString("hex") +
        Buffer.from(kyberCiphertext).toString("hex"),
    );

    return {
      x25519EphemeralPublicKeyDer: ephemeralPubDer,
      kyberCiphertext,
      combinedKey,
      auditCommitment,
    };
  }

  /**
   * Receiver-side decapsulation.
   *
   * Reproduces the same `combinedKey` as the sender using the two received
   * ciphertexts and the recipient's secret keys.
   */
  decapsulate(
    recipientX25519PrivateKey: KeyObject,
    recipientKyberSecretKey: Uint8Array,
    x25519EphemeralPublicKeyDer: Buffer,
    kyberCiphertext: Uint8Array,
  ): HybridDecapsulation {
    // --- Classical channel ---
    // Re-import the sender's ephemeral public key from the wire format
    const ephemeralPub = createPublicKeyFromDer(x25519EphemeralPublicKeyDer);
    const x25519SharedSecret = diffieHellman({
      privateKey: recipientX25519PrivateKey,
      publicKey: ephemeralPub,
    });

    // --- Post-quantum channel ---
    const kyberSharedSecret = ml_kem768.decapsulate(
      kyberCiphertext,
      recipientKyberSecretKey,
    );

    // --- Combine both secrets (same steps as sender) ---
    const combinedKey = this.#combineSecrets(
      x25519SharedSecret,
      kyberSharedSecret,
    );

    return { combinedKey };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Derive a single 32-byte key from two independent shared secrets using
   * HKDF-SHA256.  The label "hybrid-kem-v1" acts as a domain separator.
   */
  #combineSecrets(x25519Secret: Buffer, kyberSecret: Uint8Array): Buffer {
    const ikm = Buffer.concat([x25519Secret, Buffer.from(kyberSecret)]);
    return Buffer.from(
      hkdfSync(
        "sha256",
        ikm,
        Buffer.alloc(32, 0),
        Buffer.from("hybrid-kem-v1", "utf8"),
        32,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Internal utility
// ---------------------------------------------------------------------------

/**
 * Reconstruct an X25519 public key from a SPKI DER buffer received over the
 * wire.  Node.js's `createPublicKey` accepts the `der` + `type: 'spki'`
 * combination for all standard curve families including X25519.
 */
function createPublicKeyFromDer(der: Buffer): KeyObject {
  return createPublicKey({ key: der, format: "der", type: "spki" });
}
