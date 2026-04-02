import { getNumberEnv, getRequiredEnv } from "../../shared/src/env";
import type {
  CordaGatewayProfile,
  CordaGatewayRequest,
  ICordaFlowInvoker,
  ICordaProfileFactory,
  ICordaRequestBuilder,
  ProviderClearancePayload,
} from "./ports";

export type {
  CordaGatewayProfile,
  CordaGatewayRequest,
  ProviderClearancePayload,
} from "./ports";

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
  const hostname = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // link-local
    /^0\./, // current network
    /^\[::1\]$/, // IPv6 localhost
    /^\[fc/, // IPv6 unique local
    /^\[fd/, // IPv6 unique local
    /^\[fe80:/, // IPv6 link-local
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
    // Validate URL before making the request (SSRF protection)
    const validatedUrl = validateGatewayUrl(request.url);

    const response = await fetch(validatedUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(
        `Corda gateway error: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  }
}

/**
 * Facade for backward compatibility.
 * NOTE: sketch only — use a secrets manager or token provider in production
 */
export class CordaGatewayClientSketch
  implements ICordaProfileFactory, ICordaRequestBuilder, ICordaFlowInvoker
{
  private readonly profileFactory = new CordaProfileFactory();
  private readonly requestBuilder = new CordaRequestBuilder();
  private readonly flowInvoker = new CordaFlowInvoker();

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
    return this.flowInvoker.invokeFlow(request);
  }
}
