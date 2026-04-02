import { createPrivateKey } from "node:crypto";
import { readFile } from "node:fs/promises";

import grpc from "@grpc/grpc-js";
import {
  connect,
  hash,
  signers,
  type ConnectOptions,
  type Contract,
  type Gateway,
  type Identity,
  type Signer,
} from "@hyperledger/fabric-gateway";

import { getOptionalEnv, getRequiredEnv } from "../../shared/src/env";
import type {
  FabricGatewayProfile,
  FabricProposalPlan,
  IFabricConnectionFactory,
  IFabricGatewayFactory,
  IFabricProfileFactory,
  IFabricProposalBuilder,
} from "./ports";

export type { FabricGatewayProfile, FabricProposalPlan } from "./ports";

export class FabricProfileFactory implements IFabricProfileFactory {
  createProfileFromEnv(
    env: NodeJS.ProcessEnv = process.env,
  ): FabricGatewayProfile {
    const profile: FabricGatewayProfile = {
      mspId: getRequiredEnv("FABRIC_MSP_ID", env),
      channelName: getRequiredEnv("FABRIC_CHANNEL_NAME", env),
      chaincodeName: getRequiredEnv("FABRIC_CHAINCODE_NAME", env),
      peerEndpoint: getRequiredEnv("FABRIC_PEER_ENDPOINT", env),
      tlsCertPath: getRequiredEnv("FABRIC_TLS_CERT_PATH", env),
      identityCertPath: getRequiredEnv("FABRIC_IDENTITY_CERT_PATH", env),
      privateKeyPath: getRequiredEnv("FABRIC_PRIVATE_KEY_PATH", env),
    };

    const peerHostAlias = getOptionalEnv("FABRIC_PEER_HOST_ALIAS", env);
    if (peerHostAlias) {
      profile.peerHostAlias = peerHostAlias;
    }

    return profile;
  }

  createProfile(profile: FabricGatewayProfile): FabricGatewayProfile {
    if (!profile.peerEndpoint.includes(":")) {
      throw new Error(
        "FabricGatewayProfile.peerEndpoint must be in host:port format",
      );
    }
    return profile;
  }
}

export class FabricConnectionFactory implements IFabricConnectionFactory {
  async createGrpcClient(profile: FabricGatewayProfile): Promise<grpc.Client> {
    const tlsRootCert = await readFile(profile.tlsCertPath);
    const credentials = grpc.credentials.createSsl(tlsRootCert);
    const options: grpc.ClientOptions = {};

    if (profile.peerHostAlias) {
      options["grpc.ssl_target_name_override"] = profile.peerHostAlias;
      options["grpc.default_authority"] = profile.peerHostAlias;
    }

    return new grpc.Client(profile.peerEndpoint, credentials, options);
  }

  async createIdentity(profile: FabricGatewayProfile): Promise<Identity> {
    return {
      mspId: profile.mspId,
      credentials: await readFile(profile.identityCertPath),
    };
  }

  async createSigner(profile: FabricGatewayProfile): Promise<Signer> {
    const privateKeyPem = await readFile(profile.privateKeyPath);
    const privateKey = createPrivateKey(privateKeyPem);

    return signers.newPrivateKeySigner(privateKey);
  }
}

export class FabricGatewayFactory implements IFabricGatewayFactory {
  constructor(private readonly connectionFactory: IFabricConnectionFactory) {}

  async createGateway(
    profile: FabricGatewayProfile,
  ): Promise<{ gateway: Gateway; client: grpc.Client }> {
    const client = await this.connectionFactory.createGrpcClient(profile);
    const identity = await this.connectionFactory.createIdentity(profile);
    const signer = await this.connectionFactory.createSigner(profile);

    const options: ConnectOptions = {
      client,
      identity,
      signer,
      hash: hash.sha256,
    };

    return {
      gateway: connect(options),
      client,
    };
  }

  getContract(gateway: Gateway, profile: FabricGatewayProfile): Contract {
    const network = gateway.getNetwork(profile.channelName);
    return network.getContract(profile.chaincodeName);
  }
}

export class FabricProposalBuilder implements IFabricProposalBuilder {
  buildRecordShipmentProposal(input: {
    lotId: string;
    shipmentId: string;
    temperatureCelsius: number;
    location: string;
    telemetryTimestamp: string;
    endorsingOrganizations: string[];
  }): FabricProposalPlan {
    const payload = JSON.stringify(input);

    return {
      transactionName: "RecordShipment",
      args: [
        input.lotId,
        input.shipmentId,
        String(input.temperatureCelsius),
        input.location,
      ],
      transientData: {
        telemetryTimestamp: Buffer.from(input.telemetryTimestamp, "utf8"),
      },
      endorsingOrganizations: input.endorsingOrganizations,
      payloadDigestHex: Buffer.from(
        hash.sha256(Buffer.from(payload, "utf8")),
      ).toString("hex"),
    };
  }

  buildEvaluateRecallRequest(input: {
    lotId: string;
    reason: string;
  }): FabricProposalPlan {
    const args = [input.lotId];
    const transientData = {
      recallReason: Buffer.from(input.reason, "utf8"),
    };
    return {
      transactionName: "TraceOrigin",
      args,
      transientData,
      endorsingOrganizations: ["RetailerMSP", "SupplierMSP"],
      payloadDigestHex: Buffer.from(
        hash.sha256(Buffer.from(JSON.stringify(input), "utf8")),
      ).toString("hex"),
    };
  }
}

/**
 * Facade for backward compatibility.
 */
export class FabricGatewayClientSketch
  implements
    IFabricProfileFactory,
    IFabricConnectionFactory,
    IFabricGatewayFactory,
    IFabricProposalBuilder
{
  private readonly profileFactory = new FabricProfileFactory();
  private readonly connectionFactory = new FabricConnectionFactory();
  private readonly gatewayFactory = new FabricGatewayFactory(
    this.connectionFactory,
  );
  private readonly proposalBuilder = new FabricProposalBuilder();

  createProfileFromEnv(env?: NodeJS.ProcessEnv): FabricGatewayProfile {
    return this.profileFactory.createProfileFromEnv(env);
  }

  createProfile(profile: FabricGatewayProfile): FabricGatewayProfile {
    return this.profileFactory.createProfile(profile);
  }

  createGrpcClient(profile: FabricGatewayProfile): Promise<grpc.Client> {
    return this.connectionFactory.createGrpcClient(profile);
  }

  createIdentity(profile: FabricGatewayProfile): Promise<Identity> {
    return this.connectionFactory.createIdentity(profile);
  }

  createSigner(profile: FabricGatewayProfile): Promise<Signer> {
    return this.connectionFactory.createSigner(profile);
  }

  createGateway(
    profile: FabricGatewayProfile,
  ): Promise<{ gateway: Gateway; client: grpc.Client }> {
    return this.gatewayFactory.createGateway(profile);
  }

  getContract(gateway: Gateway, profile: FabricGatewayProfile): Contract {
    return this.gatewayFactory.getContract(gateway, profile);
  }

  buildRecordShipmentProposal(input: {
    lotId: string;
    shipmentId: string;
    temperatureCelsius: number;
    location: string;
    telemetryTimestamp: string;
    endorsingOrganizations: string[];
  }): FabricProposalPlan {
    return this.proposalBuilder.buildRecordShipmentProposal(input);
  }

  buildEvaluateRecallRequest(input: {
    lotId: string;
    reason: string;
  }): FabricProposalPlan {
    return this.proposalBuilder.buildEvaluateRecallRequest(input);
  }
}
