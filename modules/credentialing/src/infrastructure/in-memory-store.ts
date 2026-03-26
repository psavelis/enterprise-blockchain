import { InMemoryStore } from "../../../shared/src/store";
import type { ClinicalCredential, ProviderProfile } from "../domain/entities";
import type { CredentialRepository } from "../domain/ports";

export class InMemoryCredentialRepository implements CredentialRepository {
  readonly providers = new InMemoryStore<string, ProviderProfile>();
  private readonly credentials = new InMemoryStore<
    string,
    ClinicalCredential[]
  >();

  addProvider(provider: ProviderProfile): void {
    this.providers.set(provider.id, provider);
  }

  addCredential(credential: ClinicalCredential): void {
    const existing = this.credentials.get(credential.providerId) ?? [];
    existing.push(credential);
    this.credentials.set(credential.providerId, existing);
  }

  getCredentials(providerId: string): readonly ClinicalCredential[] {
    return [...(this.credentials.get(providerId) ?? [])];
  }
}
