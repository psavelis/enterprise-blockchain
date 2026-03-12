import {
  Contract,
  Interface,
  JsonRpcProvider,
  Wallet,
  type ContractRunner,
  type TransactionRequest,
} from "ethers";

import consortiumRegistryArtifact from "../../../../contracts/ConsortiumOrderRegistry.json";
import type {
  PurchaseOrder,
  SharedOrderView,
} from "../../../privacy/src/index";
import {
  getOptionalEnv,
  getNumberEnv,
  getRequiredEnv,
} from "../../shared/src/env";

const consortiumInterface = new Interface(consortiumRegistryArtifact.abi);

export interface BesuRpcProfile {
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  walletPrivateKey?: string;
  privacyGroupId?: string;
}

export interface BesuPrivateTransactionRequest {
  transaction: TransactionRequest;
  privacyGroupId: string;
}

export class BesuEthersClientSketch {
  createProfileFromEnv(env: NodeJS.ProcessEnv = process.env): BesuRpcProfile {
    const profile: BesuRpcProfile = {
      rpcUrl: getRequiredEnv("BESU_RPC_URL", env),
      chainId: getNumberEnv("BESU_CHAIN_ID", 1337, env),
      contractAddress: getRequiredEnv("BESU_CONTRACT_ADDRESS", env),
    };

    const walletPrivateKey = getOptionalEnv("BESU_WALLET_PRIVATE_KEY", env);
    if (walletPrivateKey) {
      profile.walletPrivateKey = walletPrivateKey;
    }

    const privacyGroupId = getOptionalEnv("BESU_PRIVACY_GROUP_ID", env);
    if (privacyGroupId) {
      profile.privacyGroupId = privacyGroupId;
    }

    return profile;
  }

  createProfile(profile: BesuRpcProfile): BesuRpcProfile {
    return profile;
  }

  createProvider(profile: BesuRpcProfile): JsonRpcProvider {
    return new JsonRpcProvider(profile.rpcUrl, profile.chainId);
  }

  createSigner(profile: BesuRpcProfile): Wallet {
    if (!profile.walletPrivateKey) {
      throw new Error("walletPrivateKey is required to create a Besu signer");
    }

    return new Wallet(profile.walletPrivateKey, this.createProvider(profile));
  }

  createContract(profile: BesuRpcProfile, runner?: ContractRunner): Contract {
    const resolvedRunner = runner ?? this.createProvider(profile);
    return new Contract(
      profile.contractAddress,
      consortiumRegistryArtifact.abi,
      resolvedRunner,
    );
  }

  buildAnchorOrderTransaction(
    profile: BesuRpcProfile,
    order: PurchaseOrder,
    auditProof: string,
  ): TransactionRequest {
    return {
      to: profile.contractAddress,
      chainId: profile.chainId,
      data: consortiumInterface.encodeFunctionData("anchorOrder", [
        order.id,
        order.buyer,
        order.supplier,
        auditProof,
      ]),
    };
  }

  buildAudienceViewTransaction(
    profile: BesuRpcProfile,
    view: SharedOrderView,
  ): BesuPrivateTransactionRequest {
    if (!profile.privacyGroupId) {
      throw new Error(
        "privacyGroupId is required to build a Besu private transaction",
      );
    }

    return {
      privacyGroupId: profile.privacyGroupId,
      transaction: {
        to: profile.contractAddress,
        chainId: profile.chainId,
        data: consortiumInterface.encodeFunctionData("publishAudienceView", [
          view.orderId,
          view.audience,
          JSON.stringify(view.data),
          view.auditProof,
        ]),
      },
    };
  }
}
