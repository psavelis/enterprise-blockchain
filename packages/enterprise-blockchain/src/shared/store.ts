/**
 * Port interface for key-value storage.
 *
 * Domain services depend on this abstraction rather than on concrete Map
 * instances, keeping infrastructure concerns (persistence, caching, replication)
 * out of the domain layer.
 */
export interface ReadonlyStore<K, V> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  values(): IterableIterator<V>;
  entries(): IterableIterator<[K, V]>;
}

export interface Store<K, V> extends ReadonlyStore<K, V> {
  set(key: K, value: V): void;
}

export class InMemoryStore<K, V> implements Store<K, V> {
  private readonly data = new Map<K, V>();

  set(key: K, value: V): void {
    this.data.set(key, value);
  }

  get(key: K): V | undefined {
    return this.data.get(key);
  }

  has(key: K): boolean {
    return this.data.has(key);
  }

  values(): IterableIterator<V> {
    return this.data.values();
  }

  entries(): IterableIterator<[K, V]> {
    return this.data.entries();
  }
}
