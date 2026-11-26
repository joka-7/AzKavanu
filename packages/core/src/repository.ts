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
  type StudyTrackInput,
} from './model';
import type { LocalStorePort } from './ports';
import { safe } from './links';
import { sessionOn, type ScheduleContext, type Session } from './schedule';

const DOC_PREFIX = 'doc:';
const DIRTY_KEY = 'meta:dirty';

export type TrackInput = Omit<StudyTrackInput, 'hlc' | 'deleted' | 'id'> & { id?: string };

/**
 * The local replica. The UI reads and writes only this; the sync engine
 * reconciles it with Drive in the background.
 */
export class Repository {
  private docs = new Map<string, RecordDoc<any>>();
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private doneIndex: Map<string, ISODate[]> | null = null;
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

  /** Dates each track was completed, ascending. Rebuilt lazily after any change. */
  doneDates(trackId: string): readonly ISODate[] {
    if (!this.doneIndex) {
      const index = new Map<string, ISODate[]>();
      for (const [name, doc] of this.docs) {
        if (docKind(name) !== 'progress') continue;
        for (const [key, rec] of Object.entries(doc.records as Record<string, ProgressRecord>)) {
          if (!rec.done) continue;
          const cut = key.lastIndexOf('|');
          const id = key.slice(0, cut);
          const list = index.get(id) ?? [];
          list.push(key.slice(cut + 1));
          index.set(id, list);
        }
      }
      for (const list of index.values()) list.sort();
      this.doneIndex = index;
    }
    return this.doneIndex.get(trackId) ?? [];
  }

  /** Everything the schedule engine needs to resolve this track's sessions. */
  context = (trackId: string): ScheduleContext => ({
    doneDates: this.doneDates(trackId),
    israel: this.setting('israel', false),
  });

  session(track: StudyTrack, date: ISODate): Session | null {
    const s = sessionOn(track, date, this.context(track.id));
    const custom = this.progress(track.id, date)?.link;
    return s && custom ? { ...s, customUrl: custom } : s;
  }

  /** Sessions of all active tracks on a date. */
  sessions(date: ISODate): Session[] {
    const out: Session[] = [];
    for (const t of this.tracks()) {
      if (t.archived) continue;
      const s = this.session(t, date);
      if (s) out.push(s);
    }
    return out;
  }

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
      ...(prev?.link ? { link: prev.link } : {}),
      done,
      ...(done ? { doneAt: new Date(this.clockNow()).toISOString() } : {}),
      hlc: this.clock.tick(),
    };
    await this.put(progressDocName(yearOf(date)), progressKey(trackId, date), rec);
  }

  /** Attach (or, with null, remove) a link for one day's session. Only http(s) links are accepted. */
  async setSessionLink(trackId: string, date: ISODate, url: string | null): Promise<void> {
    const prev = this.progress(trackId, date);
    let clean: string | undefined;
    if (url !== null && url.trim()) {
      const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      clean = safe(withScheme) ?? undefined;
      if (!clean) throw new Error('Invalid link');
    }
    const rec: ProgressRecord = {
      done: prev?.done ?? false,
      ...(prev?.doneAt ? { doneAt: prev.doneAt } : {}),
      ...(prev?.note ? { note: prev.note } : {}),
      ...(clean ? { link: clean } : {}),
      hlc: this.clock.tick(),
    };
    await this.put(progressDocName(yearOf(date)), progressKey(trackId, date), rec);
  }

  /** Add a daily reminder to an existing track (it follows the track's own schedule). */
  async addReminder(trackId: string, time: string, onlyIfNotDone = true): Promise<void> {
    const track = this.track(trackId);
    if (!track || track.reminders.length >= 10) return;
    if (track.reminders.some((r) => r.time === time && r.onlyIfNotDone === onlyIfNotDone)) return;
    await this.saveTrack({
      ...track,
      reminders: [...track.reminders, { id: `r_${crypto.randomUUID().slice(0, 8)}`, time, onlyIfNotDone }],
    });
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
    this.doneIndex = null;
    this.revision++;
    for (const l of this.listeners) l();
  }
}
