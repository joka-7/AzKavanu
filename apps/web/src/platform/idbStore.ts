import type { LocalStorePort } from '@kavanu/core';

const STORE = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Minimal key-value store over IndexedDB. */
export class IdbStore implements LocalStorePort {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name = 'kavanu'): Promise<IdbStore> {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    return new IdbStore(await req(open));
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    return this.db.transaction(STORE, mode).objectStore(STORE);
  }

  get<T>(key: string): Promise<T | undefined> {
    return req(this.tx('readonly').get(key)) as Promise<T | undefined>;
  }
  async set(key: string, value: unknown): Promise<void> {
    await req(this.tx('readwrite').put(value, key));
  }
  async delete(key: string): Promise<void> {
    await req(this.tx('readwrite').delete(key));
  }
  async keys(): Promise<string[]> {
    return (await req(this.tx('readonly').getAllKeys())).map(String);
  }
}
