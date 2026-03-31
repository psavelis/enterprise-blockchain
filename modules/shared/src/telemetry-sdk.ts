/**
 * OpenTelemetry SDK initialization.
 *
 * This module should be imported at application startup BEFORE any other
 * imports to ensure proper instrumentation:
 *
 *   import "@enterprise-blockchain/shared/telemetry-sdk";
 *
 * The SDK is configured via standard OpenTelemetry environment variables:
 * - OTEL_SERVICE_NAME: Service name (default: "enterprise-blockchain")
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint (e.g., "http://localhost:4318")
 * - OTEL_TRACES_EXPORTER: Trace exporter type (default: "otlp" if endpoint set)
 * - OTEL_METRICS_EXPORTER: Metrics exporter type (default: "otlp" if endpoint set)
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

  sdk.start();

  // Graceful shutdown handler
  const shutdown = (): void => {
    sdk
      ?.shutdown()
      .then(() => {
        console.log("OpenTelemetry SDK shut down successfully");
      })
      .catch((err: unknown) => {
        console.error("Error shutting down OpenTelemetry SDK:", err);
      });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log(
    `OpenTelemetry SDK initialized: service=${serviceName}, endpoint=${endpoint}`,
  );
} else {
  console.log(
    "OpenTelemetry SDK not initialized: OTEL_EXPORTER_OTLP_ENDPOINT not set",
  );
}

export { sdk };
