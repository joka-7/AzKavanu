import type { DrivePort, LocalStorePort, RemoteFile } from './ports';

/** In-memory adapters, used by tests and as a fallback when IndexedDB is unavailable. */
export class MemoryStore implements LocalStorePort {
  private data = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }
  async set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.data.keys()];
  }
}

export class MemoryDrive implements DrivePort {
  files = new Map<string, { name: string; version: number; content: unknown }>();
  private nextId = 1;
  async list(): Promise<RemoteFile[]> {
    return [...this.files].map(([id, f]) => ({ id, name: f.name, version: String(f.version) }));
  }
  async download(id: string): Promise<unknown> {
    const f = this.files.get(id);
    if (!f) throw new Error('not found');
    return structuredClone(f.content);
  }
  async create(name: string, content: unknown): Promise<RemoteFile> {
    const id = `f${this.nextId++}`;
    this.files.set(id, { name, version: 1, content: structuredClone(content) });
    return { id, name, version: '1' };
  }
  async update(id: string, content: unknown): Promise<RemoteFile> {
    const f = this.files.get(id);
    if (!f) throw new Error('not found');
    f.version += 1;
    f.content = structuredClone(content);
    return { id, name: f.name, version: String(f.version) };
  }
  async remove(id: string): Promise<void> {
    this.files.delete(id);
  }
}

export class MemoryGroupFiles {
  files = new Map<string, { version: number; content: unknown }>();
  private nextId = 1;
  async create(_name: string, content: unknown) {
    const id = `g${this.nextId++}`;
    this.files.set(id, { version: 1, content: structuredClone(content) });
    return { id, version: '1' };
  }
  private file(id: string) {
    const f = this.files.get(id);
    if (!f) throw new Error('File not found or access revoked');
    return f;
  }
  async version(id: string) {
    return String(this.file(id).version);
  }
  async download(id: string) {
    return structuredClone(this.file(id).content);
  }
  async update(id: string, content: unknown) {
    const f = this.file(id);
    f.version += 1;
    f.content = structuredClone(content);
    return { version: String(f.version) };
  }
}
