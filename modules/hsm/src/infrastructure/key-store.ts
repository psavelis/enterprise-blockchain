import type { KeyEntry } from "../domain/entities";
import type { KeyStore } from "../domain/ports";

export class InMemoryKeyStore implements KeyStore {
  private readonly data = new Map<string, KeyEntry>();

  has(label: string): boolean {
    return this.data.has(label);
  }

  get(label: string): KeyEntry | undefined {
    return this.data.get(label);
  }

  set(label: string, entry: KeyEntry): void {
    this.data.set(label, entry);
  }
}
