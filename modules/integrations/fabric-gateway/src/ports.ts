import type { Client as GrpcClient } from "@grpc/grpc-js";
import type {
  Contract,
  Gateway,
  Identity,
  Signer,
} from "@hyperledger/fabric-gateway";

export interface FabricGatewayProfile {
  mspId: string;
  channelName: string;
  chaincodeName: string;
  peerEndpoint: string;
  peerHostAlias?: string;
  tlsCertPath: string;
  identityCertPath: string;
  privateKeyPath: string;
}

export interface FabricProposalPlan {
  transactionName: string;
  args: string[];
  transientData?: Record<string, Uint8Array>;
  endorsingOrganizations: string[];
  payloadDigestHex: string;
}

export interface IFabricProfileFactory {
  createProfileFromEnv(env?: NodeJS.ProcessEnv): FabricGatewayProfile;
  createProfile(profile: FabricGatewayProfile): FabricGatewayProfile;
}

export interface IFabricConnectionFactory {
  createGrpcClient(profile: FabricGatewayProfile): Promise<GrpcClient>;
  createIdentity(profile: FabricGatewayProfile): Promise<Identity>;
  createSigner(profile: FabricGatewayProfile): Promise<Signer>;
}

export interface IFabricGatewayFactory {
  createGateway(
    profile: FabricGatewayProfile,
  ): Promise<{ gateway: Gateway; client: GrpcClient }>;
  getContract(gateway: Gateway, profile: FabricGatewayProfile): Contract;
}

export interface IFabricProposalBuilder {
  buildRecordShipmentProposal(input: {
    lotId: string;
    shipmentId: string;
    temperatureCelsius: number;
    location: string;
    telemetryTimestamp: string;
    endorsingOrganizations: string[];
  }): FabricProposalPlan;

  buildEvaluateRecallRequest(input: {
    lotId: string;
    reason: string;
  }): FabricProposalPlan;
}
