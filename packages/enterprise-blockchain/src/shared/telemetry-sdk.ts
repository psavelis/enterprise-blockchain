/**
 * OpenTelemetry SDK initialization.
 *
 * This module should be imported at application startup BEFORE any other
 * imports to ensure proper instrumentation:
 *
 *   import "@psavelis/enterprise-blockchain/shared/telemetry-sdk";
 *
 * The SDK is configured via standard OpenTelemetry environment variables:
 * - OTEL_SERVICE_NAME: Service name (default: "enterprise-blockchain")
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (e.g., "http://localhost:4318")
 * - OTEL_TRACES_EXPORTER: Trace exporter type (default: "otlp" if endpoint set)
 * - OTEL_METRICS_EXPORTER: Metrics exporter type (default: "otlp" if endpoint set)
 *
 * Additional configuration:
 * - OTEL_LOG_LEVEL: Set to "silent" to suppress console output
 * - OTEL_REGISTER_SIGNAL_HANDLERS: Set to "false" to disable SIGTERM/SIGINT handlers
 *
 * If OTEL_EXPORTER_OTLP_ENDPOINT is not set, telemetry is disabled (no-op).
 *
 * Ref: https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const serviceName = process.env.OTEL_SERVICE_NAME ?? "enterprise-blockchain";

// Configuration flags for library-friendly behavior
const isSilent = process.env.OTEL_LOG_LEVEL === "silent";
const registerSignalHandlers =
  process.env.OTEL_REGISTER_SIGNAL_HANDLERS !== "false";

/**
 * Internal logger that respects OTEL_LOG_LEVEL=silent.
 * This prevents unwanted console output in tests, serverless, or CLI environments.
 */
const log = {
  info: (message: string): void => {
    if (!isSilent) {
      console.log(message);
    }
  },
  error: (message: string, error?: unknown): void => {
    if (!isSilent) {
      console.error(message, error);
    }
  },
};

let sdk: NodeSDK | null = null;

if (endpoint) {
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10_000, // Export metrics every 10 seconds
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
  });

  // Start the SDK. NodeSDK.start() is synchronous and returns void.
  // Errors during startup will throw, so we wrap in try-catch for safety.
  try {
    sdk.start();
  } catch (err: unknown) {
    log.error("OpenTelemetry SDK failed to start:", err);
  }

  // Graceful shutdown handler - only register if enabled
  if (registerSignalHandlers) {
    const shutdown = (): void => {
      sdk
        ?.shutdown()
        .then(() => {
          log.info("OpenTelemetry SDK shut down successfully");
        })
        .catch((err: unknown) => {
          log.error("Error shutting down OpenTelemetry SDK:", err);
        });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }

  log.info(
    `OpenTelemetry SDK initialized: service=${serviceName}, endpoint=${endpoint}`,
  );
} else {
  log.info(
    "OpenTelemetry SDK not initialized: OTEL_EXPORTER_OTLP_ENDPOINT not set",
  );
}

export { sdk };
