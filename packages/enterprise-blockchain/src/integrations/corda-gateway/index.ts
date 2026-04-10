import { getNumberEnv, getRequiredEnv } from "../shared/env.js";
import {
  CircuitBreaker,
  CORDA_RETRY_POLICY,
  CORDA_NON_RETRYABLE,
  withRetry,
  type CircuitBreakerOptions,
} from "../shared/retry.js";
import {
  createTracer,
  withSpan,
  TelemetryAttributes,
} from "../../shared/telemetry.js";
import type {
  CordaGatewayProfile,
  CordaGatewayRequest,
  ICordaFlowInvoker,
  ICordaProfileFactory,
  ICordaRequestBuilder,
  ProviderClearancePayload,
} from "./ports.js";

const tracer = createTracer("corda-gateway");

export type {
  CordaGatewayProfile,
  CordaGatewayRequest,
  ProviderClearancePayload,
} from "./ports.js";

export class CordaProfileFactory implements ICordaProfileFactory {
  createProfileFromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): CordaGatewayProfile {
    return {
      baseUrl: getRequiredEnv("CORDA_GATEWAY_BASE_URL", env),
      network: getRequiredEnv("CORDA_GATEWAY_NETWORK", env),
      bearerToken: getRequiredEnv("CORDA_GATEWAY_TOKEN", env),
      timeoutMs: getNumberEnv("CORDA_GATEWAY_TIMEOUT_MS", 10000, env),
    };
  }

  createProfile(profile: CordaGatewayProfile): CordaGatewayProfile {
    return profile;
  }
}

export class CordaRequestBuilder implements ICordaRequestBuilder {
  buildIssueClearanceRequest(
    profile: CordaGatewayProfile,
    payload: ProviderClearancePayload,
  ): CordaGatewayRequest {
    return {
      method: "POST",
      url: `${profile.baseUrl}/api/v1/networks/${profile.network}/flows/IssueProviderClearanceFlow`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profile.bearerToken}`,
      },
      body: JSON.stringify({
        clientRequestId: `${payload.providerId}-${payload.scheduledAt}`,
        command: payload.approved ? "ApproveClearance" : "RejectClearance",
        payload,
      }),
      timeoutMs: profile.timeoutMs,
    };
  }
}

/**
 * Validates that a URL is safe to fetch (SSRF protection).
 * - Must be HTTPS protocol
 * - Must not target private/internal IP ranges
 * @throws Error if URL fails validation
 */
function validateGatewayUrl(urlString: string): URL {
  const url = new URL(urlString);

  // Require HTTPS for production gateway connections
  if (url.protocol !== "https:") {
    throw new Error(
      `SSRF protection: Corda gateway URL must use HTTPS, got ${url.protocol}`,
    );
  }

  // Block private/internal IP ranges
  // Note: URL.hostname returns IPv6 addresses WITHOUT brackets (e.g., "::1" not "[::1]")
  const hostname = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // link-local
    /^0\./, // current network
    /^::1$/, // IPv6 localhost (no brackets in URL.hostname)
    /^fc/, // IPv6 unique local (no brackets in URL.hostname)
    /^fd/, // IPv6 unique local (no brackets in URL.hostname)
    /^fe80:/, // IPv6 link-local (no brackets in URL.hostname)
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      throw new Error(
        `SSRF protection: Corda gateway URL must not target private networks`,
      );
    }
  }

  return url;
}

export class CordaFlowInvoker implements ICordaFlowInvoker {
  async invokeFlow(request: CordaGatewayRequest): Promise<Response> {
    return withSpan(tracer, "corda.invokeFlow", async (span) => {
      span.setAttribute(TelemetryAttributes.BLOCKCHAIN_PLATFORM, "corda");
      span.setAttribute("corda.method", request.method);
      span.setAttribute("corda.timeout_ms", request.timeoutMs);

      // Validate URL before making the request (SSRF protection)
      const validatedUrl = validateGatewayUrl(request.url);

      try {
        const response = await fetch(validatedUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: AbortSignal.timeout(request.timeoutMs),
        });

        span.setAttribute("corda.response_status", response.status);

        if (!response.ok) {
          const errorMsg = `Corda gateway error: ${response.status} ${response.statusText}`;
          span.setAttribute(TelemetryAttributes.ERROR_MESSAGE, errorMsg);
          throw new Error(errorMsg);
        }
        return response;
      } catch (err: unknown) {
        if (err instanceof Error) {
          span.setAttribute(TelemetryAttributes.ERROR_MESSAGE, err.message);
        }
        throw err;
      }
    });
  }
}

/**
 * Resilient Corda gateway client with circuit breaker and retry support.
 *
 * Circuit breaker prevents cascading failures when Corda REST API is unavailable.
 * Retry policy handles transient HTTP errors (502, 503, 504, TIMEOUT).
 *
 * NOTE: sketch only — use a secrets manager or token provider in production
 */
export class CordaGatewayClientSketch
  implements ICordaProfileFactory, ICordaRequestBuilder, ICordaFlowInvoker
{
  private readonly profileFactory = new CordaProfileFactory();
  private readonly requestBuilder = new CordaRequestBuilder();
  private readonly flowInvoker = new CordaFlowInvoker();
  private readonly circuitBreaker: CircuitBreaker;

  constructor(circuitBreakerOptions?: Partial<CircuitBreakerOptions>) {
    this.circuitBreaker = new CircuitBreaker(
      circuitBreakerOptions,
      "corda-gateway",
    );
  }

  createProfileFromEnv(env?: NodeJS.ProcessEnv): CordaGatewayProfile {
    return this.profileFactory.createProfileFromEnv(env);
  }

  createProfile(profile: CordaGatewayProfile): CordaGatewayProfile {
    return this.profileFactory.createProfile(profile);
  }

  buildIssueClearanceRequest(
    profile: CordaGatewayProfile,
    payload: ProviderClearancePayload,
  ): CordaGatewayRequest {
    return this.requestBuilder.buildIssueClearanceRequest(profile, payload);
  }

  invokeFlow(request: CordaGatewayRequest): Promise<Response> {
    return this.circuitBreaker.execute(() =>
      withRetry(
        () => this.flowInvoker.invokeFlow(request),
        CORDA_RETRY_POLICY,
        CORDA_NON_RETRYABLE,
        extractHttpErrorCode,
        "corda.invokeFlow",
      ),
    );
  }

  /** Get circuit breaker state for monitoring dashboards. */
  getCircuitBreakerHealth() {
    return this.circuitBreaker.getHealthStatus();
  }

  /** Reset circuit breaker (use after resolving underlying issues). */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }
}

/**
 * Extract HTTP error codes for retry policy decisions.
 */
function extractHttpErrorCode(err: unknown): string {
  if (err instanceof Error) {
    // Check for timeout errors
    if (err.name === "TimeoutError" || err.message.includes("timeout")) {
      return "TIMEOUT";
    }
    // Extract HTTP status from error message (e.g., "Corda gateway error: 502 Bad Gateway")
    const statusMatch = err.message.match(/(\d{3})/);
    if (statusMatch?.[1]) {
      return statusMatch[1];
    }
  }
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.status === "number") return String(e.status);
    if (typeof e.statusCode === "number") return String(e.statusCode);
  }
  return "UNKNOWN";
}
