import test from "node:test";
import assert from "node:assert/strict";

import { MPCEngine } from "../modules/mpc/src/index";
import { QuantumResistantVault } from "../modules/mpc/src/quantum";

// ---------------------------------------------------------------------------
// MPCEngine
// ---------------------------------------------------------------------------

test("split and reconstruct a secret via additive shares", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "a", name: "A", endpoint: "a.local" });
  engine.registerParty({ id: "b", name: "B", endpoint: "b.local" });
  engine.registerParty({ id: "c", name: "C", endpoint: "c.local" });

  const secret = 42_000;
  const shares = engine.splitSecret(secret, ["a", "b", "c"]);

  for (const s of shares) engine.submitShare("round-1", s);

  const result = engine.compute("round-1", "sum");
  assert.equal(result.aggregate, secret);
  assert.equal(result.participantCount, 3);
});

test("integrity verification succeeds for untampered shares", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "x", name: "X", endpoint: "x.local" });
  engine.registerParty({ id: "y", name: "Y", endpoint: "y.local" });

  const shares = engine.splitSecret(100, ["x", "y"]);
  for (const s of shares) engine.submitShare("verify-round", s);

  assert.equal(engine.verifyIntegrity("verify-round"), true);
});

test("integrity verification fails for tampered shares", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "x", name: "X", endpoint: "x.local" });
  engine.registerParty({ id: "y", name: "Y", endpoint: "y.local" });

  const shares = engine.splitSecret(100, ["x", "y"]);
  shares[0]!.value += 1; // tamper
  for (const s of shares) engine.submitShare("tamper-round", s);

  assert.equal(engine.verifyIntegrity("tamper-round"), false);
});

test("threshold computation detects exceeded limit", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "a", name: "A", endpoint: "a.local" });
  engine.registerParty({ id: "b", name: "B", endpoint: "b.local" });

  const shares = engine.splitSecret(500, ["a", "b"]);
  for (const s of shares) engine.submitShare("threshold-round", s);

  const result = engine.compute("threshold-round", "threshold", {
    threshold: 400,
  });
  assert.equal(result.exceeded, true);
  assert.equal(result.meta.threshold, 400);
});

test("submitShare rejects duplicate submission from same party", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "a", name: "A", endpoint: "a.local" });
  engine.registerParty({ id: "b", name: "B", endpoint: "b.local" });

  const shares = engine.splitSecret(100, ["a", "b"]);
  engine.submitShare("dup-round", shares[0]!);
  assert.throws(
    () => engine.submitShare("dup-round", shares[0]!),
    /already submitted/i,
  );
});

test("compute rejects incomplete additive share sets", () => {
  const engine = new MPCEngine();
  engine.registerParty({ id: "a", name: "A", endpoint: "a.local" });
  engine.registerParty({ id: "b", name: "B", endpoint: "b.local" });
  engine.registerParty({ id: "c", name: "C", endpoint: "c.local" });

  const shares = engine.splitSecret(100, ["a", "b", "c"]);
  engine.submitShare("partial-round", shares[0]!);
  engine.submitShare("partial-round", shares[1]!);

  assert.throws(
    () => engine.compute("partial-round", "sum"),
    /incomplete share set/i,
  );
});

test("splitSecret rejects fewer than 2 parties", () => {
  const engine = new MPCEngine();
  assert.throws(() => engine.splitSecret(1, ["solo"]), /at least two parties/i);
});

// ---------------------------------------------------------------------------
// QuantumResistantVault
// ---------------------------------------------------------------------------

test("distribute and reconstruct with full share set", () => {
  const vault = new QuantumResistantVault();
  const secret = 7_777n;

  const shares = vault.distributeSecret(secret, ["n1", "n2", "n3"], 2);
  const all = [...shares.values()];

  assert.equal(vault.reconstructSecret(all, 2), secret);
});

test("below-threshold reconstruction returns null", () => {
  const vault = new QuantumResistantVault();
  const shares = vault.distributeSecret(
    1234n,
    ["n1", "n2", "n3", "n4", "n5"],
    3,
  );
  const twoShares = [...shares.values()].slice(0, 2);

  assert.equal(vault.reconstructSecret(twoShares, 3), null);
});

test("any k-of-n shares reconstruct the secret (Shamir)", () => {
  const vault = new QuantumResistantVault();
  const secret = 55_555n;
  const shares = vault.distributeSecret(
    secret,
    ["n1", "n2", "n3", "n4", "n5"],
    3,
  );

  const firstThree = [...shares.values()].slice(0, 3);
  assert.equal(vault.reconstructSecret(firstThree, 3), secret);

  const lastThree = [...shares.values()].slice(2, 5);
  assert.equal(vault.reconstructSecret(lastThree, 3), secret);

  const all = [...shares.values()];
  assert.equal(vault.reconstructSecret(all, 3), secret);
});

test("hash ladder produces deterministic depth and scheme", () => {
  const vault = new QuantumResistantVault();
  const ladder = vault.createHashLadder(128);

  assert.equal(ladder.depth, 128);
  assert.equal(ladder.scheme, "sha256-chain");
  assert.equal(typeof ladder.publicRoot, "string");
  assert.equal(ladder.publicRoot.length, 64); // hex-encoded SHA-256
});

test("anchor produces hash-ladder proof", () => {
  const vault = new QuantumResistantVault();
  const anchor = vault.anchorWithPostQuantumProof("test-document");

  assert.equal(anchor.scheme, "hash-ladder");
  assert.equal(anchor.depth, 256);
  assert.equal(anchor.dataHash.length, 64);
  assert.equal(anchor.ladderRoot.length, 64);
});

test("distributeSecret rejects threshold below 2", () => {
  const vault = new QuantumResistantVault();
  assert.throws(() => vault.distributeSecret(1n, ["a", "b"], 1), /at least 2/i);
});

test("distributeSecret rejects threshold exceeding party count", () => {
  const vault = new QuantumResistantVault();
  assert.throws(
    () => vault.distributeSecret(1n, ["a", "b"], 5),
    /exceed party count/i,
  );
});

test("256-bit secret: split across 5 parties, reconstruct from 3", () => {
  const vault = new QuantumResistantVault();
  // A realistic 256-bit key (AES-256 equivalent)
  const keyBytes = new Uint8Array([
    0x1a, 0x2b, 0x3c, 0x4d, 0x5e, 0x6f, 0x70, 0x81,
    0x92, 0xa3, 0xb4, 0xc5, 0xd6, 0xe7, 0xf8, 0x09,
    0x10, 0x21, 0x32, 0x43, 0x54, 0x65, 0x76, 0x87,
    0x98, 0xa9, 0xba, 0xcb, 0xdc, 0xed, 0xfe, 0x0f,
  ]);

  const shares = vault.distributeSecret(keyBytes, ["p1", "p2", "p3", "p4", "p5"], 3);
  assert.equal(shares.size, 5);

  const threeShares = [...shares.values()].slice(0, 3);
  const recovered = vault.reconstructSecretBytes(threeShares, 3, 32);

  assert.ok(recovered !== null);
  assert.deepEqual(recovered, keyBytes);
});

test("distributeSecret accepts number for backward compatibility", () => {
  const vault = new QuantumResistantVault();
  const shares = vault.distributeSecret(42, ["a", "b", "c"], 2);
  const all = [...shares.values()];
  assert.equal(vault.reconstructSecret(all, 2), 42n);
});
