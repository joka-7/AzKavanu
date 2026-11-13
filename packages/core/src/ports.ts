export interface RemoteFile {
  id: string;
  /** File name without the `.json` extension. */
  name: string;
  /** Opaque token that changes whenever the file content changes. */
  version: string;
}

/** The slice of Google Drive the sync engine needs. */
export interface DrivePort {
  list(): Promise<RemoteFile[]>;
  download(id: string): Promise<unknown>;
  create(name: string, content: unknown): Promise<RemoteFile>;
  update(id: string, content: unknown): Promise<RemoteFile>;
  remove(id: string): Promise<void>;
}

/** Durable key-value storage for the local replica (IndexedDB in the browser). */
export interface LocalStorePort {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}
