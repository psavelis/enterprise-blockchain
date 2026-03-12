import { getNumberEnv, getRequiredEnv } from "../../shared/src/env";

export interface CordaGatewayProfile {
  baseUrl: string;
  network: string;
  bearerToken: string;
  timeoutMs: number;
}

export interface CordaGatewayRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
}

export interface ProviderClearancePayload {
  providerId: string;
  facility: string;
  jurisdiction: string;
  scheduledAt: string;
  requiredCredentials: string[];
  approved: boolean;
  reasons: string[];
}

export class CordaGatewayClientSketch {
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

  async invokeFlow(request: CordaGatewayRequest): Promise<Response> {
    return fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  }
}
