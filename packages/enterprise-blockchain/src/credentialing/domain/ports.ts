import type { ReadonlyStore } from "../../shared/store.js";
import type { ClinicalCredential, ProviderProfile } from "./entities.js";

export interface CredentialRepository {
  readonly providers: ReadonlyStore<string, ProviderProfile>;
  getCredentials(providerId: string): readonly ClinicalCredential[];
  addProvider(provider: ProviderProfile): void;
  addCredential(credential: ClinicalCredential): void;
}
