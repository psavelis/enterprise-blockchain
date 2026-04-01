/**
 * Unit tests for modules/shared utilities.
 *
 * Tests cryptographic primitives, store implementations, date utilities,
 * logging, and commitment functions.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { sha256hex } from "../modules/shared/src/crypto";
import { InMemoryStore } from "../modules/shared/src/store";
import { CollectionStore } from "../modules/shared/src/collection-store";
import { daysUntil } from "../modules/shared/src/date";
import { noopLogger, ConsoleLogger } from "../modules/shared/src/logger";
import { commitShare } from "../modules/shared/src/commit";

// Type for parsed log entries
interface LogEntry {
  level: string;
  msg: string;
  ts: string;
  module?: string;
  operation?: string;
  result?: string;
  [key: string]: string | number | boolean | undefined;
}

// ── Crypto Tests ─────────────────────────────────────────────────────────────

test("sha256hex: returns 64-character hex string", () => {
  const hash = sha256hex("hello");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("sha256hex: deterministic output", () => {
  const hash1 = sha256hex("test-input");
  const hash2 = sha256hex("test-input");
  assert.equal(hash1, hash2);
});

test("sha256hex: different inputs produce different hashes", () => {
  const hash1 = sha256hex("input-a");
  const hash2 = sha256hex("input-b");
  assert.notEqual(hash1, hash2);
});

test("sha256hex: known vector", () => {
  // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  const hash = sha256hex("hello");
  assert.equal(
    hash,
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

// ── InMemoryStore Tests ──────────────────────────────────────────────────────

test("InMemoryStore: set and get", () => {
  const store = new InMemoryStore<string, number>();
  store.set("key1", 42);
  assert.equal(store.get("key1"), 42);
});

test("InMemoryStore: get returns undefined for missing key", () => {
  const store = new InMemoryStore<string, string>();
  assert.equal(store.get("nonexistent"), undefined);
});

test("InMemoryStore: has returns correct boolean", () => {
  const store = new InMemoryStore<string, string>();
  assert.equal(store.has("key"), false);
  store.set("key", "value");
  assert.equal(store.has("key"), true);
});

test("InMemoryStore: values iterator", () => {
  const store = new InMemoryStore<string, number>();
  store.set("a", 1);
  store.set("b", 2);
  store.set("c", 3);

  const values = [...store.values()];
  assert.equal(values.length, 3);
  assert.ok(values.includes(1));
  assert.ok(values.includes(2));
  assert.ok(values.includes(3));
});

test("InMemoryStore: entries iterator", () => {
  const store = new InMemoryStore<string, number>();
  store.set("x", 10);
  store.set("y", 20);

  const entries = [...store.entries()];
  assert.equal(entries.length, 2);
  assert.deepEqual(
    entries.sort((a, b) => a[0].localeCompare(b[0])),
    [
      ["x", 10],
      ["y", 20],
    ],
  );
});

test("InMemoryStore: overwrite existing key", () => {
  const store = new InMemoryStore<string, string>();
  store.set("key", "original");
  store.set("key", "updated");
  assert.equal(store.get("key"), "updated");
});

// ── CollectionStore Tests ────────────────────────────────────────────────────

test("CollectionStore: append and getAll", () => {
  const store = new CollectionStore<string, number>();
  store.append("list1", 1);
  store.append("list1", 2);
  store.append("list1", 3);

  const items = store.getAll("list1");
  assert.deepEqual(items, [1, 2, 3]);
});

test("CollectionStore: getAll returns empty array for missing key", () => {
  const store = new CollectionStore<string, string>();
  const items = store.getAll("nonexistent");
  assert.deepEqual(items, []);
});

test("CollectionStore: getAll returns defensive copy", () => {
  const store = new CollectionStore<string, number>();
  store.append("key", 1);

  const items1 = store.getAll("key");
  const items2 = store.getAll("key");

  // Mutating the returned array should not affect the store
  (items1 as number[]).push(999);
  assert.deepEqual(store.getAll("key"), [1]);
  assert.deepEqual(items2, [1]);
});

test("CollectionStore: keys iterator", () => {
  const store = new CollectionStore<string, number>();
  store.append("alpha", 1);
  store.append("beta", 2);
  store.append("gamma", 3);

  const keys = [...store.keys()];
  assert.equal(keys.length, 3);
  assert.ok(keys.includes("alpha"));
  assert.ok(keys.includes("beta"));
  assert.ok(keys.includes("gamma"));
});

test("CollectionStore: multiple keys with separate lists", () => {
  const store = new CollectionStore<string, string>();
  store.append("list-a", "a1");
  store.append("list-a", "a2");
  store.append("list-b", "b1");

  assert.deepEqual(store.getAll("list-a"), ["a1", "a2"]);
  assert.deepEqual(store.getAll("list-b"), ["b1"]);
});

// ── Date Tests ───────────────────────────────────────────────────────────────

test("daysUntil: same day returns 0", () => {
  const date = new Date("2024-01-15T12:00:00Z");
  assert.equal(daysUntil(date, date), 0);
});

test("daysUntil: one day apart", () => {
  const from = new Date("2024-01-15T00:00:00Z");
  const to = new Date("2024-01-16T00:00:00Z");
  assert.equal(daysUntil(from, to), 1);
});

test("daysUntil: partial day rounds up", () => {
  const from = new Date("2024-01-15T00:00:00Z");
  const to = new Date("2024-01-15T01:00:00Z"); // 1 hour later
  assert.equal(daysUntil(from, to), 1);
});

test("daysUntil: negative days for past dates", () => {
  const from = new Date("2024-01-20T00:00:00Z");
  const to = new Date("2024-01-15T00:00:00Z");
  assert.equal(daysUntil(from, to), -5);
});

test("daysUntil: one week", () => {
  const from = new Date("2024-01-01T00:00:00Z");
  const to = new Date("2024-01-08T00:00:00Z");
  assert.equal(daysUntil(from, to), 7);
});

// ── Logger Tests ─────────────────────────────────────────────────────────────

test("noopLogger: does not throw", () => {
  assert.doesNotThrow(() => {
    noopLogger.info("test message");
    noopLogger.warn("test warning", { operation: "test" });
    noopLogger.error("test error", { entityId: "123" });
  });
});

test("ConsoleLogger: outputs JSON with required fields", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    const logger = new ConsoleLogger("test-module");
    logger.info("test message", { operation: "test-op" });

    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]!) as LogEntry;
    assert.equal(entry.level, "info");
    assert.equal(entry.msg, "test message");
    assert.equal(entry.module, "test-module");
    assert.equal(entry.operation, "test-op");
    assert.ok(entry.ts);
  } finally {
    console.log = originalLog;
  }
});

test("ConsoleLogger: warn uses console.warn", () => {
  const logs: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => logs.push(msg);

  try {
    const logger = new ConsoleLogger();
    logger.warn("warning message");

    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]!) as LogEntry;
    assert.equal(entry.level, "warn");
    assert.equal(entry.msg, "warning message");
  } finally {
    console.warn = originalWarn;
  }
});

test("ConsoleLogger: error uses console.error", () => {
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => logs.push(msg);

  try {
    const logger = new ConsoleLogger();
    logger.error("error message", { result: "failed" });

    assert.equal(logs.length, 1);
    const entry = JSON.parse(logs[0]!) as LogEntry;
    assert.equal(entry.level, "error");
    assert.equal(entry.msg, "error message");
    assert.equal(entry.result, "failed");
  } finally {
    console.error = originalError;
  }
});

test("ConsoleLogger: reserved fields cannot be overridden", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg: string) => logs.push(msg);

  try {
    const logger = new ConsoleLogger("module");
    // Attempt to override reserved fields via LogFields
    logger.info("test", { level: "hacked", ts: "fake", msg: "fake" } as never);

    const entry = JSON.parse(logs[0]!) as LogEntry;
    assert.equal(entry.level, "info");
    assert.equal(entry.msg, "test");
    assert.notEqual(entry.ts, "fake");
  } finally {
    console.log = originalLog;
  }
});

// ── Commit Tests ─────────────────────────────────────────────────────────────

test("commitShare: deterministic output", () => {
  const commit1 = commitShare("party-a", 1, 42, "nonce123");
  const commit2 = commitShare("party-a", 1, 42, "nonce123");
  assert.equal(commit1, commit2);
});

test("commitShare: different nonce produces different commitment", () => {
  const commit1 = commitShare("party-a", 1, 42, "nonce-1");
  const commit2 = commitShare("party-a", 1, 42, "nonce-2");
  assert.notEqual(commit1, commit2);
});

test("commitShare: different party produces different commitment", () => {
  const commit1 = commitShare("party-a", 1, 42, "nonce");
  const commit2 = commitShare("party-b", 1, 42, "nonce");
  assert.notEqual(commit1, commit2);
});

test("commitShare: different index produces different commitment", () => {
  const commit1 = commitShare("party-a", 1, 42, "nonce");
  const commit2 = commitShare("party-a", 2, 42, "nonce");
  assert.notEqual(commit1, commit2);
});

test("commitShare: different value produces different commitment", () => {
  const commit1 = commitShare("party-a", 1, 42, "nonce");
  const commit2 = commitShare("party-a", 1, 43, "nonce");
  assert.notEqual(commit1, commit2);
});

test("commitShare: handles bigint values", () => {
  const commit1 = commitShare("party", 1, 12345678901234567890n, "nonce");
  const commit2 = commitShare("party", 1, 12345678901234567890n, "nonce");
  assert.equal(commit1, commit2);
  assert.equal(commit1.length, 64);
});

test("commitShare: number and equivalent bigint produce same commitment", () => {
  const commitNumber = commitShare("party", 1, 42, "nonce");
  const commitBigint = commitShare("party", 1, 42n, "nonce");
  // Note: "42" vs "42" when stringified should be the same
  assert.equal(commitNumber, commitBigint);
});
