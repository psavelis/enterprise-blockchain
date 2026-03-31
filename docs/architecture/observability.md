# Observability

How to instrument and monitor the enterprise blockchain integration layer using OpenTelemetry.

## Overview

The repository provides OpenTelemetry instrumentation for:

- **Distributed tracing**: Track requests across blockchain protocol boundaries
- **Metrics**: Monitor retry counts, circuit breaker states, and operation latencies
- **Structured logging**: Correlate logs with trace context

## Quick Start

### 1. Enable telemetry export

Set the OTLP endpoint environment variable:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=my-blockchain-service
```

### 2. Initialize the SDK (optional)

For automatic instrumentation, import the SDK initialization at application startup:

```typescript
// Import BEFORE any other imports
import "@enterprise-blockchain/shared/telemetry-sdk";

// Then import your application code
import { FabricGateway } from "./fabric-gateway";
```

### 3. Create tracers and meters

```typescript
import { createTracer, createMeter } from "@enterprise-blockchain/shared";

const tracer = createTracer("my-service");
const meter = createMeter("my-service");
```

## Instrumented Components

### Retry Policy (`withRetry`)

The `withRetry` function creates spans for each retry attempt:

```
retry.operation (parent span)
├── retry.attempt (attempt 1)
├── retry.attempt (attempt 2, with backoff event)
└── retry.attempt (attempt 3)
```

**Span attributes:**

| Attribute              | Description                         |
| ---------------------- | ----------------------------------- |
| `retry.attempt`        | Current attempt number (1-indexed)  |
| `retry.max_attempts`   | Maximum attempts configured         |
| `retry.error_code`     | Error code from failed attempt      |
| `retry.delay_ms`       | Backoff delay before next attempt   |
| `retry.total_attempts` | Total attempts made (on completion) |

**Metrics:**

| Metric            | Type    | Description                              |
| ----------------- | ------- | ---------------------------------------- |
| `retry.attempts`  | Counter | Number of retry attempts                 |
| `retry.successes` | Counter | Successful operations (with retry count) |
| `retry.failures`  | Counter | Operations that failed after all retries |

### Circuit Breaker

The `CircuitBreaker` class emits state transition metrics:

**Metrics:**

| Metric                        | Type    | Description                                   |
| ----------------------------- | ------- | --------------------------------------------- |
| `circuit_breaker.state`       | Gauge   | Current state (0=closed, 1=half-open, 2=open) |
| `circuit_breaker.transitions` | Counter | State transitions with from/to labels         |

**Labels:**

| Label                        | Description                    |
| ---------------------------- | ------------------------------ |
| `circuit_breaker.name`       | Circuit breaker instance name  |
| `circuit_breaker.from_state` | Previous state (on transition) |
| `circuit_breaker.to_state`   | New state (on transition)      |

## Environment Variables

| Variable                      | Default                 | Description                         |
| ----------------------------- | ----------------------- | ----------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (none)                  | OTLP collector URL (enables export) |
| `OTEL_SERVICE_NAME`           | `enterprise-blockchain` | Service name in traces              |
| `OTEL_TRACES_EXPORTER`        | `otlp`                  | Trace exporter type                 |
| `OTEL_METRICS_EXPORTER`       | `otlp`                  | Metrics exporter type               |

When `OTEL_EXPORTER_OTLP_ENDPOINT` is not set, telemetry is disabled (no-op mode).

## Collector Setup

### Local development with Jaeger

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Access the Jaeger UI at http://localhost:16686

### Production with OpenTelemetry Collector

Deploy the OpenTelemetry Collector with OTLP receivers:

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:

exporters:
  jaeger:
    endpoint: jaeger:14250
    tls:
      insecure: true
  prometheus:
    endpoint: 0.0.0.0:9090

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [jaeger]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
```

## Custom Instrumentation

### Creating spans

```typescript
import {
  createTracer,
  withSpan,
  TelemetryAttributes,
} from "@enterprise-blockchain/shared";

const tracer = createTracer("my-service");

async function submitTransaction(txId: string): Promise<void> {
  await withSpan(tracer, "submit.transaction", async (span) => {
    span.setAttribute(TelemetryAttributes.BLOCKCHAIN_TX_ID, txId);
    span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "fabric");

    // ... transaction logic

    span.addEvent("endorsement.complete", {
      endorsers: 3,
    });
  });
}
```

### Creating metrics

```typescript
import { createMeter } from "@enterprise-blockchain/shared";

const meter = createMeter("my-service");

const txCounter = meter.createCounter("transactions.submitted", {
  description: "Number of transactions submitted",
  unit: "1",
});

const txLatency = meter.createHistogram("transactions.latency", {
  description: "Transaction latency",
  unit: "ms",
});

// Record metrics
txCounter.add(1, { platform: "fabric", channel: "mychannel" });
txLatency.record(150, { platform: "fabric" });
```

## Trace Context Propagation

When calling external services, propagate trace context:

```typescript
import { context, propagation } from "@enterprise-blockchain/shared";

// Inject context into headers
const headers: Record<string, string> = {};
propagation.inject(context.active(), headers);

// Send request with propagated context
await fetch(url, { headers });
```

## Semantic Conventions

Use the provided `TelemetryAttributes` for consistency:

```typescript
import { TelemetryAttributes } from "@enterprise-blockchain/shared";

span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "besu");
span.setAttribute(TelemetryAttributes.BLOCKCHAIN_TX_ID, txHash);
span.setAttribute(TelemetryAttributes.RETRY_ATTEMPT, 2);
span.setAttribute(TelemetryAttributes.CIRCUIT_BREAKER_STATE, "open");
```

## Grafana Dashboards

Example PromQL queries for Grafana:

```promql
# Retry success rate
sum(rate(retry_successes_total[5m])) / sum(rate(retry_attempts_total[5m]))

# Circuit breaker open rate
sum(circuit_breaker_state == 2) by (circuit_breaker_name)

# P95 transaction latency
histogram_quantile(0.95, rate(transactions_latency_bucket[5m]))
```

## References

- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
