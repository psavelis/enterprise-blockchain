import type { ReadonlyStore } from "../../shared/store";
import type { ClinicalCredential, ProviderProfile } from "./entities";

export interface CredentialRepository {
  readonly providers: ReadonlyStore<string, ProviderProfile>;
  getCredentials(providerId: string): readonly ClinicalCredential[];
  addProvider(provider: ProviderProfile): void;
  addCredential(credential: ClinicalCredential): void;
}
