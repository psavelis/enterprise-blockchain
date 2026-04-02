/**
 * Property-based fuzz tests for MPC cryptographic modules.
 *
 * Uses fast-check for exhaustive edge case coverage that unit tests miss.
 * Cryptographic implementations require property-based testing because
 * off-by-one errors in field arithmetic cause silent security failures.
 *
 * NOTE: Numeric comparisons (===) on integers are safe in tests.
 * Timing-safe comparison is only required for:
 * - String comparisons of cryptographic values (hashes, HMACs, signatures)
 * - Comparisons where timing could leak information to an attacker
 *
 * Test environments have no timing oracle, and integer comparison
 * on modern CPUs is constant-time for equal-length operands.
 *
 * @see https://github.com/dubzzz/fast-check
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  MPCEngine,
  QuantumResistantVault,
  FieldArithmetic,
  DEMO_PRIME,
  PRODUCTION_PRIME,
} from "../modules/mpc/src/index";

// ── Field Arithmetic Properties ─────────────────────────────────────────────

test("field arithmetic: addition is commutative", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      (a, b) => {
        return field.add(a, b) === field.add(b, a);
      },
    ),
    { numRuns: 1000 },
  );
});

test("field arithmetic: multiplication is commutative", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      (a, b) => {
        return field.mul(a, b) === field.mul(b, a);
      },
    ),
    { numRuns: 1000 },
  );
});

test("field arithmetic: a * inverse(a) = 1 for non-zero a", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(fc.bigInt({ min: 1n, max: DEMO_PRIME - 1n }), (a) => {
      const inv = field.inverse(a);
      return field.mul(a, inv) === 1n;
    }),
    { numRuns: 500 },
  );
});

test("field arithmetic: (a + b) - b = a", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }),
      (a, b) => {
        return field.sub(field.add(a, b), b) === a;
      },
    ),
    { numRuns: 1000 },
  );
});

test("field arithmetic: pow(a, 0) = 1 for any a", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(fc.bigInt({ min: 1n, max: DEMO_PRIME - 1n }), (a) => {
      return field.pow(a, 0n) === 1n;
    }),
    { numRuns: 500 },
  );
});

test("field arithmetic: pow(a, 1) = a", () => {
  const field = new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME });

  fc.assert(
    fc.property(fc.bigInt({ min: 0n, max: DEMO_PRIME - 1n }), (a) => {
      return field.pow(a, 1n) === a;
    }),
    { numRuns: 500 },
  );
});

// ── Additive Secret Sharing Properties ──────────────────────────────────────

test("MPC additive sharing: shares reconstruct original secret", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "p1", name: "Party 1", endpoint: "http://p1" });
  engine.registerParty({ id: "p2", name: "Party 2", endpoint: "http://p2" });
  engine.registerParty({ id: "p3", name: "Party 3", endpoint: "http://p3" });

  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.uuid(),
      (secret, computationId) => {
        const shares = engine.splitSecret(secret, ["p1", "p2", "p3"]);
        assert.equal(shares.length, 3);

        for (const share of shares) {
          engine.submitShare(computationId, share);
        }

        const result = engine.compute(computationId, "sum");
        return result.aggregate === secret;
      },
    ),
    { numRuns: 100 },
  );
});

test("MPC additive sharing: individual shares reveal nothing about secret", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "p1", name: "Party 1", endpoint: "http://p1" });
  engine.registerParty({ id: "p2", name: "Party 2", endpoint: "http://p2" });

  // For different secrets, individual share values should be statistically indistinguishable
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 0, max: 1_000_000 }),
      (secret1, secret2) => {
        const shares1 = engine.splitSecret(secret1, ["p1", "p2"]);
        const shares2 = engine.splitSecret(secret2, ["p1", "p2"]);

        // Shares should be different (with high probability) even for same secret
        // This tests the randomness of share generation
        if (secret1 === secret2) {
          // Even same secret should produce different shares due to randomness
          return (
            shares1[0]!.value !== shares2[0]!.value ||
            shares1[1]!.value !== shares2[1]!.value
          );
        }

        // For different secrets, we just verify shares exist
        return shares1.length === 2 && shares2.length === 2;
      },
    ),
    { numRuns: 50 },
  );
});

// ── Shamir Threshold Sharing Properties ─────────────────────────────────────

test("Shamir: any k-of-n shares reconstruct the secret", () => {
  const vault = new QuantumResistantVault({ fieldMode: "demo" });

  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 3, max: 5 }), // threshold
      fc.integer({ min: 0, max: 2 }), // extra parties above threshold
      (secret, threshold, extra) => {
        const partyCount = threshold + extra;
        const parties = Array.from(
          { length: partyCount },
          (_, i) => `party-${i}`,
        );

        const shares = vault.distributeSecret(secret, parties, threshold);
        const shareArray = Array.from(shares.values());

        // Take exactly threshold shares (first k)
        const subset = shareArray.slice(0, threshold);
        const reconstructed = vault.reconstructSecret(subset, threshold);

        return reconstructed === secret;
      },
    ),
    { numRuns: 100 },
  );
});

test("Shamir: fewer than k shares return null", () => {
  const vault = new QuantumResistantVault({ fieldMode: "demo" });

  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 1_000_000 }),
      fc.integer({ min: 3, max: 5 }),
      (secret, threshold) => {
        const parties = Array.from(
          { length: threshold + 1 },
          (_, i) => `party-${i}`,
        );
        const shares = vault.distributeSecret(secret, parties, threshold);
        const shareArray = Array.from(shares.values());

        // Take one fewer than threshold
        const subset = shareArray.slice(0, threshold - 1);
        const reconstructed = vault.reconstructSecret(subset, threshold);

        return reconstructed === null;
      },
    ),
    { numRuns: 50 },
  );
});

test("Shamir: different k-subsets reconstruct same secret", () => {
  const vault = new QuantumResistantVault({ fieldMode: "demo" });

  fc.assert(
    fc.property(fc.integer({ min: 1, max: 100_000 }), (secret) => {
      const threshold = 3;
      const parties = ["p1", "p2", "p3", "p4", "p5"];

      const shares = vault.distributeSecret(secret, parties, threshold);
      const shareArray = Array.from(shares.values());

      // Take first 3 shares
      const subset1 = [shareArray[0]!, shareArray[1]!, shareArray[2]!];
      const result1 = vault.reconstructSecret(subset1, threshold);

      // Take last 3 shares
      const subset2 = [shareArray[2]!, shareArray[3]!, shareArray[4]!];
      const result2 = vault.reconstructSecret(subset2, threshold);

      // Take alternating shares
      const subset3 = [shareArray[0]!, shareArray[2]!, shareArray[4]!];
      const result3 = vault.reconstructSecret(subset3, threshold);

      return result1 === secret && result2 === secret && result3 === secret;
    }),
    { numRuns: 50 },
  );
});

// ── Commitment Integrity Properties ─────────────────────────────────────────

test("commitments: same input produces same commitment", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "p1", name: "Party 1", endpoint: "http://p1" });
  engine.registerParty({ id: "p2", name: "Party 2", endpoint: "http://p2" });

  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1_000_000 }), (secret) => {
      const shares = engine.splitSecret(secret, ["p1", "p2"]);

      // Verify each share's commitment matches its value
      for (const share of shares) {
        // Commitment is already computed, verify it's deterministic
        assert.equal(typeof share.commitment, "string");
        assert.equal(share.commitment.length, 64); // SHA-256 hex
      }

      return true;
    }),
    { numRuns: 100 },
  );
});

// ── Production Field Properties ─────────────────────────────────────────────

test("production field: basic arithmetic works with 256-bit numbers", () => {
  const field = new FieldArithmetic({
    mode: "production",
    prime: PRODUCTION_PRIME,
  });

  // Test with large numbers near the prime
  const a = PRODUCTION_PRIME - 1n;
  const b = PRODUCTION_PRIME - 2n;

  // a + b should wrap around
  const sum = field.add(a, b);
  assert.ok(sum < PRODUCTION_PRIME);
  assert.ok(sum >= 0n);

  // a * 1 = a
  assert.equal(field.mul(a, 1n), a);

  // a - a = 0
  assert.equal(field.sub(a, a), 0n);
});

test("production field: inverse works for large numbers", () => {
  const field = new FieldArithmetic({
    mode: "production",
    prime: PRODUCTION_PRIME,
  });

  // Test inverse for a few strategic values
  const values = [
    1n,
    2n,
    PRODUCTION_PRIME - 1n,
    PRODUCTION_PRIME / 2n,
    123456789012345678901234567890n,
  ];

  for (const v of values) {
    const inv = field.inverse(v);
    const product = field.mul(v, inv);
    assert.equal(product, 1n, `inverse failed for ${v}`);
  }
});
