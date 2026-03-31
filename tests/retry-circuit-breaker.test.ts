import test from "node:test";
import assert from "node:assert/strict";

import {
  withRetry,
  CircuitBreaker,
  BESU_RETRY_POLICY,
  BESU_NON_RETRYABLE,
  FABRIC_RETRY_POLICY,
  CORDA_RETRY_POLICY,
  CORDA_NON_RETRYABLE,
  isRetryable,
  computeDelay,
  IntegrationHealthChecker,
} from "../modules/integrations/shared/src/retry";

// ── Mock Error Generators ────────────────────────────────────────────

interface MockError extends Error {
  code?: string;
  status?: number;
  statusCode?: number;
}

function createMockError(
  message: string,
  code?: string,
  status?: number,
): MockError {
  const err: MockError = new Error(message);
  if (code) err.code = code;
  if (status) err.status = status;
  return err;
}

// Besu error generators
const besuErrors = {
  serverError: () => createMockError("Internal JSON-RPC error", "SERVER_ERROR"),
  timeout: () => createMockError("Request timeout", "TIMEOUT"),
  nonceTooLow: () =>
    createMockError("nonce too low: next nonce 5, got 3", "NONCE_TOO_LOW"),
  insufficientFunds: () =>
    createMockError(
      "insufficient funds for gas * price + value",
      "INSUFFICIENT_FUNDS",
    ),
  unknownError: () => createMockError("Unknown RPC error", "UNKNOWN_ERROR"),
};

// Fabric error generators (gRPC status codes)
const fabricErrors = {
  unavailable: () => createMockError("peer unavailable", "UNAVAILABLE"),
  deadlineExceeded: () =>
    createMockError("deadline exceeded", "DEADLINE_EXCEEDED"),
  permissionDenied: () =>
    createMockError("permission denied", "PERMISSION_DENIED"),
  notFound: () => createMockError("chaincode not found", "NOT_FOUND"),
};

// Corda error generators (HTTP status codes)
const cordaErrors = {
  badGateway: () => createMockError("Bad Gateway", undefined, 502),
  serviceUnavailable: () =>
    createMockError("Service Unavailable", undefined, 503),
  gatewayTimeout: () => createMockError("Gateway Timeout", undefined, 504),
  badRequest: () => createMockError("Bad Request", undefined, 400),
  unauthorized: () => createMockError("Unauthorized", undefined, 401),
  forbidden: () => createMockError("Forbidden", undefined, 403),
};

// ── Mock Response Sequence Generator ─────────────────────────────────

function createMockSequence<T>(responses: Array<T | Error>): () => Promise<T> {
  let callIndex = 0;
  return (): Promise<T> => {
    if (callIndex >= responses.length) {
      return Promise.reject(
        new Error(`Mock sequence exhausted after ${callIndex} calls`),
      );
    }
    const response = responses[callIndex++];
    if (response instanceof Error) {
      return Promise.reject(response);
    }
    return Promise.resolve(response as T);
  };
}

// ── Retry Policy Tests ───────────────────────────────────────────────

test("withRetry succeeds on first attempt", async () => {
  let attempts = 0;
  const result = await withRetry(
    () => {
      attempts++;
      return Promise.resolve("success");
    },
    BESU_RETRY_POLICY,
    BESU_NON_RETRYABLE,
  );

  assert.equal(result, "success");
  assert.equal(attempts, 1);
});

test("Besu: retries on SERVER_ERROR then succeeds", async () => {
  const mockFn = createMockSequence<string>([
    besuErrors.serverError(),
    besuErrors.serverError(),
    "transaction-hash-123",
  ]);

  const result = await withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE);

  assert.equal(result, "transaction-hash-123");
});

test("Besu: retries on TIMEOUT then succeeds", async () => {
  const mockFn = createMockSequence<string>([besuErrors.timeout(), "0xabcdef"]);

  const result = await withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE);

  assert.equal(result, "0xabcdef");
});

test("Besu: fails fast on NONCE_TOO_LOW (non-retryable)", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(besuErrors.nonceTooLow());
  };

  await assert.rejects(
    () => withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    (err: MockError) => {
      assert.equal(err.code, "NONCE_TOO_LOW");
      return true;
    },
  );

  assert.equal(attempts, 1, "Should not retry NONCE_TOO_LOW");
});

test("Besu: fails fast on INSUFFICIENT_FUNDS (non-retryable)", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(besuErrors.insufficientFunds());
  };

  await assert.rejects(
    () => withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    (err: MockError) => {
      assert.equal(err.code, "INSUFFICIENT_FUNDS");
      return true;
    },
  );

  assert.equal(attempts, 1, "Should not retry INSUFFICIENT_FUNDS");
});

test("Besu: exhausts retries on persistent SERVER_ERROR", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(besuErrors.serverError());
  };

  await assert.rejects(
    () => withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    (err: MockError) => {
      assert.equal(err.code, "SERVER_ERROR");
      return true;
    },
  );

  assert.equal(attempts, BESU_RETRY_POLICY.maxAttempts);
});

test("Fabric: retries on UNAVAILABLE then succeeds", async () => {
  const mockFn = createMockSequence<string>([
    fabricErrors.unavailable(),
    fabricErrors.unavailable(),
    fabricErrors.unavailable(),
    "endorsement-result",
  ]);

  const result = await withRetry(mockFn, FABRIC_RETRY_POLICY, []);

  assert.equal(result, "endorsement-result");
});

test("Fabric: retries on DEADLINE_EXCEEDED then succeeds", async () => {
  const mockFn = createMockSequence<string>([
    fabricErrors.deadlineExceeded(),
    "commit-hash",
  ]);

  const result = await withRetry(mockFn, FABRIC_RETRY_POLICY, []);

  assert.equal(result, "commit-hash");
});

test("Fabric: fails immediately on PERMISSION_DENIED (not retryable)", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(fabricErrors.permissionDenied());
  };

  await assert.rejects(
    () => withRetry(mockFn, FABRIC_RETRY_POLICY, []),
    (err: MockError) => {
      assert.equal(err.code, "PERMISSION_DENIED");
      return true;
    },
  );

  assert.equal(attempts, 1);
});

test("Corda: retries on 502 Bad Gateway then succeeds", async () => {
  const mockFn = createMockSequence<string>([
    cordaErrors.badGateway(),
    "flow-result",
  ]);

  const extractCode = (err: unknown) => {
    if (err && typeof err === "object") {
      const e = err as { status?: number };
      if (typeof e.status === "number") return String(e.status);
    }
    return "UNKNOWN";
  };

  const result = await withRetry(
    mockFn,
    CORDA_RETRY_POLICY,
    CORDA_NON_RETRYABLE,
    extractCode,
  );

  assert.equal(result, "flow-result");
});

test("Corda: retries on 503 Service Unavailable then succeeds", async () => {
  const mockFn = createMockSequence<string>([
    cordaErrors.serviceUnavailable(),
    cordaErrors.gatewayTimeout(),
    "clearance-issued",
  ]);

  const extractCode = (err: unknown) => {
    if (err && typeof err === "object") {
      const e = err as { status?: number };
      if (typeof e.status === "number") return String(e.status);
    }
    return "UNKNOWN";
  };

  const result = await withRetry(
    mockFn,
    CORDA_RETRY_POLICY,
    CORDA_NON_RETRYABLE,
    extractCode,
  );

  assert.equal(result, "clearance-issued");
});

test("Corda: fails fast on 400 Bad Request (non-retryable)", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(cordaErrors.badRequest());
  };

  const extractCode = (err: unknown) => {
    if (err && typeof err === "object") {
      const e = err as { status?: number };
      if (typeof e.status === "number") return String(e.status);
    }
    return "UNKNOWN";
  };

  await assert.rejects(
    () =>
      withRetry(mockFn, CORDA_RETRY_POLICY, CORDA_NON_RETRYABLE, extractCode),
    (err: MockError) => {
      assert.equal(err.status, 400);
      return true;
    },
  );

  assert.equal(attempts, 1, "Should not retry 400 Bad Request");
});

test("Corda: fails fast on 401 Unauthorized (non-retryable)", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(cordaErrors.unauthorized());
  };

  const extractCode = (err: unknown) => {
    if (err && typeof err === "object") {
      const e = err as { status?: number };
      if (typeof e.status === "number") return String(e.status);
    }
    return "UNKNOWN";
  };

  await assert.rejects(
    () =>
      withRetry(mockFn, CORDA_RETRY_POLICY, CORDA_NON_RETRYABLE, extractCode),
    (err: MockError) => {
      assert.equal(err.status, 401);
      return true;
    },
  );

  assert.equal(attempts, 1);
});

// ── Circuit Breaker Tests ────────────────────────────────────────────

test("CircuitBreaker starts in closed state", () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.getState(), "closed");
});

test("CircuitBreaker opens after 5 consecutive failures", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 1000 });

  for (let i = 0; i < 5; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error(`Failure ${i + 1}`)));
    } catch {
      // Expected
    }
  }

  assert.equal(cb.getState(), "open");
});

test("CircuitBreaker blocks requests when open", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  assert.equal(cb.getState(), "open");

  // Subsequent requests should be blocked immediately
  await assert.rejects(
    () => cb.execute(() => Promise.resolve("should not execute")),
    /Circuit breaker is OPEN/,
  );
});

test("CircuitBreaker transitions to half-open after cooldown", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  assert.equal(cb.getState(), "open");

  // Wait for cooldown
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(cb.getState(), "half-open");
});

test("CircuitBreaker closes on success in half-open state", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  // Wait for cooldown
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cb.getState(), "half-open");

  // Successful probe should close the circuit
  const result = await cb.execute(() => Promise.resolve("recovered"));
  assert.equal(result, "recovered");
  assert.equal(cb.getState(), "closed");
});

test("CircuitBreaker reopens on failure in half-open state", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  // Wait for cooldown
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cb.getState(), "half-open");

  // Failed probe should reopen the circuit
  try {
    await cb.execute(() => Promise.reject(new Error("still failing")));
  } catch {
    // Expected
  }

  assert.equal(cb.getState(), "open");
});

test("CircuitBreaker reset() restores closed state", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  assert.equal(cb.getState(), "open");

  cb.reset();

  assert.equal(cb.getState(), "closed");
  const health = cb.getHealthStatus();
  assert.equal(health.consecutiveFailures, 0);
});

test("CircuitBreaker resets failure count on success", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 1000 });

  // 3 failures
  for (let i = 0; i < 3; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  let health = cb.getHealthStatus();
  assert.equal(health.consecutiveFailures, 3);
  assert.equal(health.state, "closed");

  // Success resets the counter
  await cb.execute(() => Promise.resolve("success"));

  health = cb.getHealthStatus();
  assert.equal(health.consecutiveFailures, 0);
});

test("CircuitBreaker getHealthStatus returns correct structure", () => {
  const cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30_000 });

  const health = cb.getHealthStatus();

  assert.equal(health.state, "closed");
  assert.equal(health.healthy, true);
  assert.equal(health.consecutiveFailures, 0);
  assert.equal(health.lastFailureTime, null);
  assert.equal(health.cooldownRemainingMs, 0);
});

test("CircuitBreaker health status shows cooldown remaining when open", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 5000 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  const health = cb.getHealthStatus();
  assert.equal(health.state, "open");
  assert.equal(health.healthy, false);
  assert.ok(health.cooldownRemainingMs > 0);
  assert.ok(health.cooldownRemainingMs <= 5000);
  assert.ok(health.lastFailureTime !== null);
});

// ── Integration Health Checker Tests ─────────────────────────────────

test("IntegrationHealthChecker reports healthy when circuit closed", async () => {
  const cb = new CircuitBreaker();
  const checker = new IntegrationHealthChecker("besu-client", cb);

  const status = await checker.check();

  assert.equal(status.name, "besu-client");
  assert.equal(status.healthy, true);
  assert.equal(status.circuitBreaker.state, "closed");
  assert.ok(status.lastCheckTime);
});

test("IntegrationHealthChecker reports unhealthy when circuit open", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  const checker = new IntegrationHealthChecker("fabric-gateway", cb);
  const status = await checker.check();

  assert.equal(status.name, "fabric-gateway");
  assert.equal(status.healthy, false);
  assert.equal(status.circuitBreaker.state, "open");
});

test("IntegrationHealthChecker runs probe when circuit closed", async () => {
  const cb = new CircuitBreaker();
  let probeExecuted = false;

  const probe = () => {
    probeExecuted = true;
    return Promise.resolve();
  };

  const checker = new IntegrationHealthChecker("corda-gateway", cb, probe);
  const status = await checker.check();

  assert.equal(probeExecuted, true);
  assert.equal(status.healthy, true);
  assert.ok(status.latencyMs !== undefined);
});

test("IntegrationHealthChecker skips probe when circuit open", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 60_000 });
  let probeExecuted = false;

  // Trip the circuit
  for (let i = 0; i < 2; i++) {
    try {
      await cb.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // Expected
    }
  }

  const probe = () => {
    probeExecuted = true;
    return Promise.resolve();
  };

  const checker = new IntegrationHealthChecker("besu-client", cb, probe);
  const status = await checker.check();

  assert.equal(probeExecuted, false, "Probe should not run when circuit open");
  assert.equal(status.healthy, false);
  assert.equal(status.latencyMs, undefined);
});

test("IntegrationHealthChecker captures probe failure", async () => {
  const cb = new CircuitBreaker();

  const probe = () => {
    return Promise.reject(new Error("Connection refused"));
  };

  const checker = new IntegrationHealthChecker("failing-service", cb, probe);
  const status = await checker.check();

  assert.equal(status.healthy, false);
  assert.ok(status.error?.includes("Connection refused"));
  assert.ok(status.latencyMs !== undefined);
});

// ── Utility Function Tests ───────────────────────────────────────────

test("isRetryable returns true for retryable error codes", () => {
  assert.equal(isRetryable("SERVER_ERROR", BESU_RETRY_POLICY), true);
  assert.equal(isRetryable("TIMEOUT", BESU_RETRY_POLICY), true);
  assert.equal(isRetryable("UNAVAILABLE", FABRIC_RETRY_POLICY), true);
  assert.equal(isRetryable("DEADLINE_EXCEEDED", FABRIC_RETRY_POLICY), true);
});

test("isRetryable returns false for non-retryable error codes", () => {
  assert.equal(
    isRetryable("NONCE_TOO_LOW", BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    false,
  );
  assert.equal(
    isRetryable("INSUFFICIENT_FUNDS", BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    false,
  );
  assert.equal(
    isRetryable("400", CORDA_RETRY_POLICY, CORDA_NON_RETRYABLE),
    false,
  );
});

test("isRetryable returns false for unknown error codes", () => {
  assert.equal(isRetryable("RANDOM_ERROR", BESU_RETRY_POLICY), false);
  assert.equal(isRetryable("UNKNOWN", FABRIC_RETRY_POLICY), false);
});

test("computeDelay respects maxDelayMs ceiling", () => {
  // With many attempts, delay should cap at maxDelayMs
  const delay = computeDelay(100, BESU_RETRY_POLICY);
  assert.ok(delay <= BESU_RETRY_POLICY.maxDelayMs);
});

test("computeDelay includes jitter (varies between calls)", () => {
  const delays = new Set<number>();
  for (let i = 0; i < 10; i++) {
    delays.add(computeDelay(1, BESU_RETRY_POLICY));
  }
  // With jitter, we should see some variation (not all same value)
  assert.ok(delays.size > 1, "Delay should vary due to jitter");
});

test("computeDelay increases exponentially with attempts", () => {
  const delay0 = computeDelay(0, {
    ...BESU_RETRY_POLICY,
    maxDelayMs: 100_000,
  });
  const delay1 = computeDelay(1, {
    ...BESU_RETRY_POLICY,
    maxDelayMs: 100_000,
  });
  const delay2 = computeDelay(2, {
    ...BESU_RETRY_POLICY,
    maxDelayMs: 100_000,
  });

  // Allow for jitter, but general trend should be increasing
  // delay1 should be roughly 2x delay0, delay2 roughly 4x delay0
  assert.ok(delay1 > delay0 * 1.5, "Delay should increase with attempt");
  assert.ok(delay2 > delay1 * 1.5, "Delay should continue increasing");
});

// ── Edge Cases ───────────────────────────────────────────────────────

test("withRetry throws on invalid maxAttempts", async () => {
  await assert.rejects(
    () =>
      withRetry(() => Promise.resolve("ok"), {
        ...BESU_RETRY_POLICY,
        maxAttempts: 0,
      }),
    /maxAttempts must be >= 1/,
  );
});

test("withRetry with maxAttempts=1 does not retry", async () => {
  let attempts = 0;
  const mockFn = () => {
    attempts++;
    return Promise.reject(besuErrors.serverError());
  };

  await assert.rejects(
    () =>
      withRetry(mockFn, {
        ...BESU_RETRY_POLICY,
        maxAttempts: 1,
      }),
    (err: MockError) => err.code === "SERVER_ERROR",
  );

  assert.equal(attempts, 1);
});

test("Mixed error sequence: retryable then non-retryable", async () => {
  let attempts = 0;
  const errors = [besuErrors.serverError(), besuErrors.nonceTooLow()];

  const mockFn = () => {
    const err = errors[attempts++];
    if (err) return Promise.reject(err);
    return Promise.resolve("should not reach");
  };

  await assert.rejects(
    () => withRetry(mockFn, BESU_RETRY_POLICY, BESU_NON_RETRYABLE),
    (err: MockError) => {
      assert.equal(err.code, "NONCE_TOO_LOW");
      return true;
    },
  );

  assert.equal(
    attempts,
    2,
    "Should retry once then fail fast on non-retryable",
  );
});
