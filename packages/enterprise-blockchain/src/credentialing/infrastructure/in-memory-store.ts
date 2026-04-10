import { InMemoryStore, CollectionStore } from "../../shared/index.js";
import type {
  ClinicalCredential,
  ProviderProfile,
} from "../domain/entities.js";
import type { CredentialRepository } from "../domain/ports.js";

export class InMemoryCredentialRepository implements CredentialRepository {
  readonly providers = new InMemoryStore<string, ProviderProfile>();
  private readonly credentials = new CollectionStore<
    string,
    ClinicalCredential
  >();

  addProvider(provider: ProviderProfile): void {
    this.providers.set(provider.id, provider);
  }

  addCredential(credential: ClinicalCredential): void {
    this.credentials.append(credential.providerId, credential);
  }

  getCredentials(providerId: string): readonly ClinicalCredential[] {
    return this.credentials.getAll(providerId);
  }
}
