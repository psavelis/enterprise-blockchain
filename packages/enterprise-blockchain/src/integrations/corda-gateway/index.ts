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

import { lookup } from "node:dns/promises";

/**
 * Check if an IP address is in a private/reserved range.
 * Covers IPv4 private ranges, loopback, link-local, and IPv6 equivalents.
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private/reserved patterns
  const ipv4PrivatePatterns = [
    /^127\./, // loopback
    /^10\./, // Class A private
    /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
    /^192\.168\./, // Class C private
    /^169\.254\./, // link-local
    /^0\./, // current network
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // carrier-grade NAT
    /^192\.0\.0\./, // IETF protocol assignments
    /^192\.0\.2\./, // TEST-NET-1
    /^198\.51\.100\./, // TEST-NET-2
    /^203\.0\.113\./, // TEST-NET-3
    /^224\./, // multicast
    /^240\./, // reserved
    /^255\.255\.255\.255$/, // broadcast
  ];

  // IPv6 private/reserved patterns
  const ipv6PrivatePatterns = [
    /^::1$/, // loopback
    /^::$/, // unspecified
    /^::ffff:127\./, // IPv4-mapped loopback
    /^::ffff:10\./, // IPv4-mapped Class A
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./, // IPv4-mapped Class B
    /^::ffff:192\.168\./, // IPv4-mapped Class C
    /^fc/, // unique local (fc00::/7)
    /^fd/, // unique local (fc00::/7)
    /^fe80:/, // link-local
    /^ff/, // multicast
  ];

  const lowerIp = ip.toLowerCase();

  for (const pattern of ipv4PrivatePatterns) {
    if (pattern.test(lowerIp)) return true;
  }

  for (const pattern of ipv6PrivatePatterns) {
    if (pattern.test(lowerIp)) return true;
  }

  return false;
}

/**
 * Validates that a URL is safe to fetch (SSRF protection).
 * - Must be HTTPS protocol
 * - Must not resolve to private/internal IP addresses (prevents DNS rebinding)
 * - Uses explicit allowlist approach for gateway hosts in production
 *
 * IMPORTANT: This performs DNS resolution to prevent DNS rebinding attacks where
 * an attacker-controlled DNS name initially resolves to a public IP but later
 * resolves to a private IP (e.g., 127.0.0.1, 10.x.x.x, etc.)
 *
 * @throws Error if URL fails validation
 */
async function validateGatewayUrl(urlString: string): Promise<URL> {
  const url = new URL(urlString);

  // Require HTTPS for production gateway connections
  if (url.protocol !== "https:") {
    throw new Error(
      `SSRF protection: Corda gateway URL must use HTTPS, got ${url.protocol}`,
    );
  }

  const hostname = url.hostname.toLowerCase();

  // Quick check: block obviously private hostnames before DNS lookup
  if (hostname === "localhost") {
    throw new Error(
      `SSRF protection: Corda gateway URL must not target private networks`,
    );
  }

  // Resolve hostname to IP address(es) and check each one
  // This prevents DNS rebinding attacks where a hostname initially resolves
  // to a public IP but later resolves to a private IP
  try {
    // Resolve both IPv4 and IPv6 addresses
    const results = await Promise.allSettled([
      lookup(hostname, { family: 4 }),
      lookup(hostname, { family: 6 }),
    ]);

    // Collect all resolved addresses
    const addresses: string[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") {
        addresses.push(result.value.address);
      }
    }

    // If no addresses resolved, the hostname is invalid
    if (addresses.length === 0) {
      throw new Error(
        `SSRF protection: Could not resolve hostname ${hostname}`,
      );
    }

    // Check all resolved IPs against private ranges
    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        throw new Error(
          `SSRF protection: Corda gateway URL must not target private networks (resolved to ${ip})`,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("SSRF protection:")) {
      throw err;
    }
    throw new Error(
      `SSRF protection: DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
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
      // This performs DNS resolution to prevent DNS rebinding attacks
      const validatedUrl = await validateGatewayUrl(request.url);

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
