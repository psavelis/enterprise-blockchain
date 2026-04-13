/**
 * Shared retry policy and circuit breaker for integration adapters.
 *
 * Each platform adapter configures which error codes are retryable:
 * - Fabric: UNAVAILABLE, DEADLINE_EXCEEDED gRPC status codes
 * - Besu: SERVER_ERROR, TIMEOUT JSON-RPC errors (not NONCE_TOO_LOW)
 * - Corda: HTTP 502/503/504 (not 400/401/403)
 *
 * OpenTelemetry instrumentation:
 * - withRetry() creates spans per attempt with error code attributes
 * - CircuitBreaker emits state transition metrics
 */

import { randomBytes } from "node:crypto";

import {
  createTracer,
  createMeter,
  TelemetryAttributes,
  SpanStatusCode,
} from "../../shared/telemetry.js";

const tracer = createTracer("retry-policy");
const meter = createMeter("circuit-breaker");

// Metrics
const retryAttemptCounter = meter.createCounter("retry.attempts", {
  description: "Number of retry attempts",
  unit: "1",
});

const retrySuccessCounter = meter.createCounter("retry.successes", {
  description: "Number of successful operations (with or without retries)",
  unit: "1",
});

const retryFailureCounter = meter.createCounter("retry.failures", {
  description: "Number of operations that failed after all retries",
  unit: "1",
});

const circuitBreakerStateGauge = meter.createObservableGauge(
  "circuit_breaker.state",
  {
    description:
      "Current circuit breaker state (0=closed, 1=half-open, 2=open)",
    unit: "1",
  },
);

const circuitBreakerTransitions = meter.createCounter(
  "circuit_breaker.transitions",
  {
    description: "Number of circuit breaker state transitions",
    unit: "1",
  },
);

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
  // Use cryptographically secure randomness to prevent timing attacks
  // that could exploit predictable backoff patterns
  const randomByte = randomBytes(1)[0]!;
  const jitter = (randomByte % 30) / 100 + 0.85; // ±15%
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
  operationName = "operation",
): Promise<T> {
  if (policy.maxAttempts < 1) {
    throw new Error("RetryPolicy.maxAttempts must be >= 1");
  }

  return tracer.startActiveSpan(
    `retry.${operationName}`,
    {
      attributes: {
        [TelemetryAttributes.RETRY_MAX_ATTEMPTS]: policy.maxAttempts,
      },
    },
    async (parentSpan) => {
      let lastError: unknown;

      for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
        const attemptSpan = tracer.startSpan(`retry.attempt`, {
          attributes: {
            [TelemetryAttributes.RETRY_ATTEMPT]: attempt + 1,
            [TelemetryAttributes.RETRY_MAX_ATTEMPTS]: policy.maxAttempts,
          },
        });

        try {
          retryAttemptCounter.add(1, {
            [TelemetryAttributes.RETRY_ATTEMPT]: attempt + 1,
          });

          const result = await fn();

          attemptSpan.setStatus({ code: SpanStatusCode.OK });
          attemptSpan.end();
          parentSpan.setStatus({ code: SpanStatusCode.OK });
          parentSpan.setAttribute("retry.total_attempts", attempt + 1);
          parentSpan.end();

          retrySuccessCounter.add(1, {
            "retry.total_attempts": attempt + 1,
          });

          return result;
        } catch (err) {
          lastError = err;
          const code = extractErrorCode(err);

          attemptSpan.setAttribute(TelemetryAttributes.RETRY_ERROR_CODE, code);
          attemptSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          if (err instanceof Error) {
            attemptSpan.recordException(err);
          }
          attemptSpan.end();

          if (!isRetryable(code, policy, nonRetryable)) {
            parentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `Non-retryable error: ${code}`,
            });
            parentSpan.setAttribute("retry.total_attempts", attempt + 1);
            parentSpan.setAttribute(TelemetryAttributes.RETRY_ERROR_CODE, code);
            parentSpan.end();

            retryFailureCounter.add(1, {
              [TelemetryAttributes.RETRY_ERROR_CODE]: code,
              "retry.retryable": false,
            });

            throw err;
          }

          if (attempt < policy.maxAttempts - 1) {
            const delay = computeDelay(attempt, policy);
            parentSpan.addEvent("retry.backoff", {
              [TelemetryAttributes.RETRY_DELAY_MS]: delay,
              [TelemetryAttributes.RETRY_ATTEMPT]: attempt + 1,
            });
            await sleep(delay);
          }
        }
      }

      parentSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: `All ${policy.maxAttempts} attempts exhausted`,
      });
      parentSpan.setAttribute("retry.total_attempts", policy.maxAttempts);
      parentSpan.end();

      retryFailureCounter.add(1, {
        "retry.retryable": true,
        "retry.exhausted": true,
      });

      throw lastError;
    },
  );
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
  private readonly name: string;

  constructor(options: Partial<CircuitBreakerOptions> = {}, name = "default") {
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
    this.name = name;

    // Register observable gauge for this circuit breaker
    circuitBreakerStateGauge.addCallback((result) => {
      const stateValue =
        this.state === "closed" ? 0 : this.state === "half-open" ? 1 : 2;
      result.observe(stateValue, {
        "circuit_breaker.name": this.name,
      });
    });
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.options.cooldownMs) {
        this.transitionTo("half-open");
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
      this.transitionTo("open");
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

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const previousState = this.state;
      this.state = newState;

      circuitBreakerTransitions.add(1, {
        "circuit_breaker.name": this.name,
        "circuit_breaker.from_state": previousState,
        "circuit_breaker.to_state": newState,
      });
    }
  }

  private onSuccess(): void {
    this.consecutiveFailures = 0;
    this.transitionTo("closed");
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.transitionTo("open");
    }
  }

  /** Reset the circuit to closed state. Useful for testing. */
  reset(): void {
    this.transitionTo("closed");
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
  }

  /** Get health status for Kubernetes probes or monitoring. */
  getHealthStatus(): CircuitBreakerHealth {
    const currentState = this.getState();
    return {
      state: currentState,
      healthy: currentState === "closed",
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime:
        this.lastFailureTime > 0
          ? new Date(this.lastFailureTime).toISOString()
          : null,
      cooldownRemainingMs:
        currentState === "open"
          ? Math.max(
              0,
              this.options.cooldownMs - (Date.now() - this.lastFailureTime),
            )
          : 0,
    };
  }
}

// ── Health Check Types ───────────────────────────────────────────────

export interface CircuitBreakerHealth {
  state: CircuitState;
  healthy: boolean;
  consecutiveFailures: number;
  lastFailureTime: string | null;
  cooldownRemainingMs: number;
}

export interface IntegrationHealthStatus {
  name: string;
  healthy: boolean;
  circuitBreaker: CircuitBreakerHealth;
  lastCheckTime: string;
  latencyMs?: number;
  error?: string;
}

/**
 * Health checker for integration clients.
 * Combines circuit breaker state with active endpoint probing.
 */
export class IntegrationHealthChecker {
  constructor(
    private readonly name: string,
    private readonly circuitBreaker: CircuitBreaker,
    private readonly probe?: () => Promise<void>,
  ) {}

  async check(): Promise<IntegrationHealthStatus> {
    const circuitHealth = this.circuitBreaker.getHealthStatus();
    const status: IntegrationHealthStatus = {
      name: this.name,
      healthy: circuitHealth.healthy,
      circuitBreaker: circuitHealth,
      lastCheckTime: new Date().toISOString(),
    };

    // If circuit is open, don't probe (would fail anyway)
    if (!circuitHealth.healthy || !this.probe) {
      return status;
    }

    // Active probe to verify endpoint is reachable
    const start = Date.now();
    try {
      await this.probe();
      status.latencyMs = Date.now() - start;
    } catch (err) {
      status.healthy = false;
      status.latencyMs = Date.now() - start;
      status.error =
        err instanceof Error ? err.message : "Unknown probe failure";
    }

    return status;
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
