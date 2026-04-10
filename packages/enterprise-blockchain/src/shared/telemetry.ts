/**
 * OpenTelemetry instrumentation for distributed tracing and metrics.
 *
 * Provides tracer and meter factories that integrate with the OpenTelemetry
 * SDK. When OTEL_EXPORTER_OTLP_ENDPOINT is set, telemetry is exported to
 * the configured collector; otherwise, telemetry is a no-op.
 *
 * Usage:
 *   // First, initialize the SDK at application startup (side-effect import):
 *   import "@psavelis/enterprise-blockchain/shared/telemetry-sdk";
 *
 *   // Then import helpers from this module:
 *   import { createTracer, createMeter } from "@psavelis/enterprise-blockchain/shared/telemetry";
 *   const tracer = createTracer("my-service");
 *   const meter = createMeter("my-service");
 *
 * NOTE: This module requires @opentelemetry/api as a peer dependency.
 * It is NOT re-exported from the main shared index to preserve optional deps.
 *
 * Ref: OpenTelemetry Specification — https://opentelemetry.io/docs/specs/otel/
 */

import {
  trace,
  metrics,
  context,
  propagation,
  SpanStatusCode,
  type Tracer,
  type Meter,
  type Span,
  type SpanOptions,
  type Context,
} from "@opentelemetry/api";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Re-export types for consumers
export type { Tracer, Meter, Span, SpanOptions, Context };
export { SpanStatusCode, context, propagation };

/**
 * Service name for telemetry, read from OTEL_SERVICE_NAME or defaulting
 * to "enterprise-blockchain".
 */
export const SERVICE_NAME =
  process.env.OTEL_SERVICE_NAME ?? "enterprise-blockchain";

/**
 * Whether telemetry export is enabled (OTEL_EXPORTER_OTLP_ENDPOINT is set).
 */
export function isTelemetryEnabled(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
}

/**
 * Create a tracer for distributed tracing.
 *
 * @param name - The name of the instrumentation scope (e.g., "fabric-gateway")
 * @param version - Optional version string for the instrumentation
 */
export function createTracer(name: string, version?: string): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Create a meter for metrics collection.
 *
 * @param name - The name of the instrumentation scope (e.g., "circuit-breaker")
 * @param version - Optional version string for the instrumentation
 */
export function createMeter(name: string, version?: string): Meter {
  return metrics.getMeter(name, version);
}

/**
 * Attribute keys for telemetry following OpenTelemetry semantic conventions.
 */
export const TelemetryAttributes = {
  // Service attributes
  SERVICE_NAME: ATTR_SERVICE_NAME,

  // Retry attributes
  RETRY_ATTEMPT: "retry.attempt",
  RETRY_MAX_ATTEMPTS: "retry.max_attempts",
  RETRY_ERROR_CODE: "retry.error_code",
  RETRY_DELAY_MS: "retry.delay_ms",

  // Circuit breaker attributes
  CIRCUIT_BREAKER_STATE: "circuit_breaker.state",
  CIRCUIT_BREAKER_FAILURES: "circuit_breaker.consecutive_failures",
  CIRCUIT_BREAKER_COOLDOWN_MS: "circuit_breaker.cooldown_ms",

  // Blockchain attributes
  BLOCKCHAIN_PLATFORM: "blockchain.platform",
  BLOCKCHAIN_CHANNEL: "blockchain.channel",
  BLOCKCHAIN_CHAINCODE: "blockchain.chaincode",
  BLOCKCHAIN_TX_ID: "blockchain.transaction_id",
  BLOCKCHAIN_BLOCK_NUMBER: "blockchain.block_number",

  // Error attributes
  ERROR_TYPE: "error.type",
  ERROR_MESSAGE: "error.message",
} as const;

/**
 * Helper to run a function within a new span.
 *
 * @param tracer - The tracer to use
 * @param name - Span name
 * @param fn - Function to execute within the span
 * @param options - Optional span options
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  return tracer.startActiveSpan(name, options ?? {}, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error) {
        span.recordException(err);
      }
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Helper to run a synchronous function within a new span.
 *
 * @param tracer - The tracer to use
 * @param name - Span name
 * @param fn - Function to execute within the span
 * @param options - Optional span options
 */
export function withSpanSync<T>(
  tracer: Tracer,
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions,
): T {
  const span = tracer.startSpan(name, options);
  try {
    const result = fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    if (err instanceof Error) {
      span.recordException(err);
    }
    throw err;
  } finally {
    span.end();
  }
}
