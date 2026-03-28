/**
 * Shared retry policy and circuit breaker for integration adapters.
 *
 * Each platform adapter configures which error codes are retryable:
 * - Fabric: UNAVAILABLE, DEADLINE_EXCEEDED gRPC status codes
 * - Besu: SERVER_ERROR, TIMEOUT JSON-RPC errors (not NONCE_TOO_LOW)
 * - Corda: HTTP 502/503/504 (not 400/401/403)
 */

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  retryableErrors: [],
};

// ── Platform-specific retry policies ────────────────────────────────

export const FABRIC_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  retryableErrors: ["UNAVAILABLE", "DEADLINE_EXCEEDED"],
};

export const BESU_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 15_000,
  retryableErrors: ["SERVER_ERROR", "TIMEOUT"],
};

/** Non-retryable Besu errors (fail immediately). */
export const BESU_NON_RETRYABLE = ["NONCE_TOO_LOW", "INSUFFICIENT_FUNDS"];

export const CORDA_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  retryableErrors: ["502", "503", "504", "TIMEOUT"],
};

/** Non-retryable Corda HTTP status codes. */
export const CORDA_NON_RETRYABLE = ["400", "401", "403"];

// ── Retry with exponential backoff ──────────────────────────────────

export function isRetryable(
  errorCode: string,
  policy: RetryPolicy,
  nonRetryable: string[] = [],
): boolean {
  if (nonRetryable.includes(errorCode)) return false;
  return policy.retryableErrors.includes(errorCode);
}

export function computeDelay(attempt: number, policy: RetryPolicy): number {
  const jitter = Math.random() * 0.3 + 0.85; // ±15%
  const delay = Math.min(
    policy.baseDelayMs * Math.pow(2, attempt) * jitter,
    policy.maxDelayMs,
  );
  return Math.round(delay);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  nonRetryable: string[] = [],
  extractErrorCode: (err: unknown) => string = defaultExtractErrorCode,
): Promise<T> {
  if (policy.maxAttempts < 1) {
    throw new Error("RetryPolicy.maxAttempts must be >= 1");
  }
  let lastError: unknown;

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const code = extractErrorCode(err);

      if (!isRetryable(code, policy, nonRetryable)) {
        throw err;
      }

      if (attempt < policy.maxAttempts - 1) {
        const delay = computeDelay(attempt, policy);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

// ── Circuit Breaker ─────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.options.cooldownMs) {
        this.state = "half-open";
      }
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "open") {
      throw new Error(
        `Circuit breaker is OPEN — requests blocked for ${this.options.cooldownMs}ms cooldown`,
      );
    }

    // In half-open state, only allow one probe request through.
    // Immediately transition to open so concurrent callers are blocked
    // (prevents thundering herd after cooldown).
    if (currentState === "half-open") {
      this.state = "open";
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = "open";
    }
  }

  /** Reset the circuit to closed state. Useful for testing. */
  reset(): void {
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function defaultExtractErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string") return e.code;
    // gRPC-js ServiceError.code is a number (e.g., 14 for UNAVAILABLE)
    if (typeof e.code === "number") return String(e.code);
    if (typeof e.status === "number") return String(e.status);
    if (typeof e.statusCode === "number") return String(e.statusCode);
  }
  return "UNKNOWN";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
