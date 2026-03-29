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

export interface ICordaProfileFactory {
  createProfileFromEnv(env?: NodeJS.ProcessEnv): CordaGatewayProfile;
  createProfile(profile: CordaGatewayProfile): CordaGatewayProfile;
}

export interface ICordaRequestBuilder {
  buildIssueClearanceRequest(
    profile: CordaGatewayProfile,
    payload: ProviderClearancePayload,
  ): CordaGatewayRequest;
}

export interface ICordaFlowInvoker {
  invokeFlow(request: CordaGatewayRequest): Promise<Response>;
}
