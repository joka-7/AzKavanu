import { emptyDoc, type RecordDoc, type Stamped } from './crdt';
import { yearOf, type ISODate } from './dates';
import { HlcClock } from './hlc';
import {
  SCHEMA_VERSION,
  docKind,
  parseDoc,
  progressDocName,
  progressKey,
  trackSchema,
  type Membership,
  type ProgressRecord,
  type StudyTrack,
} from './model';
import type { LocalStorePort } from './ports';

const DOC_PREFIX = 'doc:';
const DIRTY_KEY = 'meta:dirty';

export type TrackInput = Omit<StudyTrack, 'hlc' | 'deleted' | 'id'> & { id?: string };

/**
 * The local replica. The UI reads and writes only this; the sync engine
 * reconciles it with Drive in the background.
 */
export class Repository {
  private docs = new Map<string, RecordDoc<any>>();
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private revision = 0;
  readonly clock: HlcClock;

  constructor(
    private readonly store: LocalStorePort,
    readonly deviceId: string,
    now: () => number = Date.now,
  ) {
    this.clock = new HlcClock(deviceId, now);
  }

  async load(): Promise<void> {
    for (const key of await this.store.keys()) {
      if (!key.startsWith(DOC_PREFIX)) continue;
      const name = key.slice(DOC_PREFIX.length);
      try {
        const doc = parseDoc(name, await this.store.get(key));
        this.docs.set(name, doc);
        this.observe(doc);
      } catch (err) {
        console.warn(`Ignoring unreadable local document ${name}`, err);
      }
    }
    this.dirty = new Set((await this.store.get<string[]>(DIRTY_KEY)) ?? []);
    this.emit();
  }

  // ---- reads -------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Changes on every mutation; suitable as a `useSyncExternalStore` snapshot. */
  getRevision = (): number => this.revision;

  tracks(): StudyTrack[] {
    const records = (this.docs.get('tracks')?.records ?? {}) as Record<string, StudyTrack>;
    return Object.values(records)
      .filter((t) => !t.deleted)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  track(id: string): StudyTrack | undefined {
    const t = this.docs.get('tracks')?.records[id] as StudyTrack | undefined;
    return t && !t.deleted ? t : undefined;
  }

  progress(trackId: string, date: ISODate): ProgressRecord | undefined {
    return this.docs.get(progressDocName(yearOf(date)))?.records[progressKey(trackId, date)];
  }

  isDone = (trackId: string, date: ISODate): boolean => this.progress(trackId, date)?.done === true;

  setting<T>(key: string, fallback: T): T {
    const rec = this.docs.get('settings')?.records[key] as { value: unknown } | undefined;
    return rec === undefined ? fallback : (rec.value as T);
  }

  manifestValue<T>(key: string): T | undefined {
    return (this.docs.get('manifest')?.records[key] as { value: T } | undefined)?.value;
  }

  /** Group memberships keyed by group id, including ones the user has left. */
  memberships(): Record<string, Membership> {
    return (this.docs.get('groups')?.records ?? {}) as Record<string, Membership>;
  }

  // ---- writes ------------------------------------------------------------

  async saveTrack(input: TrackInput): Promise<StudyTrack> {
    const id = input.id ?? `t_${crypto.randomUUID()}`;
    const track = trackSchema.parse({ ...input, id, deleted: false, hlc: this.clock.tick() });
    await this.put('tracks', id, track);
    return track;
  }

  async deleteTrack(id: string): Promise<void> {
    const existing = this.docs.get('tracks')?.records[id] as StudyTrack | undefined;
    if (!existing) return;
    // Tombstone rather than remove, so a stale replica cannot resurrect it.
    await this.put('tracks', id, { ...existing, deleted: true, hlc: this.clock.tick() });
  }

  async setDone(trackId: string, date: ISODate, done: boolean): Promise<void> {
    const prev = this.progress(trackId, date);
    const rec: ProgressRecord = {
      ...(prev?.note ? { note: prev.note } : {}),
      done,
      ...(done ? { doneAt: new Date(this.clockNow()).toISOString() } : {}),
      hlc: this.clock.tick(),
    };
    await this.put(progressDocName(yearOf(date)), progressKey(trackId, date), rec);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.put('settings', key, { value, hlc: this.clock.tick() });
  }

  async saveMembership(groupId: string, m: Omit<Membership, 'hlc'>): Promise<void> {
    await this.put('groups', groupId, { ...m, hlc: this.clock.tick() });
  }

  async setManifestValue(key: string, value: unknown): Promise<void> {
    await this.put('manifest', key, { value, hlc: this.clock.tick() });
  }

  // ---- sync engine surface -----------------------------------------------

  docNames(): string[] {
    return [...this.docs.keys()];
  }

  getDoc(name: string): RecordDoc<any> {
    return this.docs.get(name) ?? emptyDoc(SCHEMA_VERSION);
  }

  isDirty(name: string): boolean {
    return this.dirty.has(name);
  }

  async setDirty(name: string, dirty: boolean): Promise<void> {
    if (dirty === this.dirty.has(name)) return;
    if (dirty) this.dirty.add(name);
    else this.dirty.delete(name);
    await this.store.set(DIRTY_KEY, [...this.dirty]);
  }

  /** Replace a document with the result of merging in remote state. */
  async applyMerged(name: string, doc: RecordDoc<any>): Promise<void> {
    this.observe(doc);
    this.docs.set(name, doc);
    await this.store.set(DOC_PREFIX + name, doc);
    this.emit();
  }

  /** Everything, for user-initiated export. */
  exportAll(): Record<string, RecordDoc<any>> {
    return Object.fromEntries(this.docs);
  }

  async clearAll(): Promise<void> {
    for (const key of await this.store.keys()) await this.store.delete(key);
    this.docs.clear();
    this.dirty.clear();
    this.emit();
  }

  // ---- internals ---------------------------------------------------------

  private clockNow(): number {
    return Date.now();
  }

  private observe(doc: RecordDoc<Stamped>): void {
    for (const rec of Object.values(doc.records)) this.clock.observe(rec.hlc);
  }

  private async put(name: string, key: string, record: Stamped & Record<string, unknown>): Promise<void> {
    if (!docKind(name)) throw new Error(`Unknown document: ${name}`);
    const prev = this.getDoc(name);
    const next = { schemaVersion: prev.schemaVersion, records: { ...prev.records, [key]: record } };
    this.docs.set(name, next);
    this.emit();
    await this.store.set(DOC_PREFIX + name, next);
    await this.setDirty(name, true);
  }

  private emit(): void {
    this.revision++;
    for (const l of this.listeners) l();
  }
}
