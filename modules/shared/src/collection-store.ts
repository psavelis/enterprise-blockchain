import { InMemoryStore } from "./store";

/**
 * Append-only collection store for grouping items by key.
 * Provides immutable read access via defensive copies.
 */
export class CollectionStore<K, V> {
  private readonly store = new InMemoryStore<K, V[]>();

  append(key: K, item: V): void {
    const existing = this.store.get(key) ?? [];
    existing.push(item);
    this.store.set(key, existing);
  }

  getAll(key: K): readonly V[] {
    return [...(this.store.get(key) ?? [])];
  }

  keys(): IterableIterator<K> {
    return this.keySet().values();
  }

  private keySet(): Set<K> {
    const result = new Set<K>();
    for (const [key] of this.store.entries()) {
      result.add(key);
    }
    return result;
  }
}
