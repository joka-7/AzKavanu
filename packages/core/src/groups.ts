import { mergeDocs, type RecordDoc } from './crdt';
import { addDays, type ISODate } from './dates';
import { parseHlc } from './hlc';
import {
  SCHEMA_VERSION,
  parseGroupDoc,
  type GroupMember,
  type GroupMeta,
  type GroupRecord,
  type Membership,
  type StudyTrack,
  type TrackTemplate,
} from './model';
import type { LocalStorePort } from './ports';
import type { Repository } from './repository';
import { sessionOn } from './schedule';

/** How many days of completion history a member publishes to a group. */
export const GROUP_WINDOW_DAYS = 60;
const CACHE_PREFIX = 'group:';

/** The slice of Drive needed for shared group files (visible files, not the app-data folder). */
export interface GroupFilePort {
  create(name: string, content: unknown): Promise<{ id: string; version: string }>;
  /** Cheap change check. Rejects if the file is gone or access was revoked. */
  version(id: string): Promise<string>;
  download(id: string): Promise<unknown>;
  update(id: string, content: unknown): Promise<{ version: string }>;
}

type GroupDoc = RecordDoc<GroupRecord>;

interface CachedGroup {
  doc: GroupDoc;
  version: string | null;
  error?: string;
}

export interface MemberView {
  memberId: string;
  displayName: string;
  isMe: boolean;
  /** Oldest first; `null` where the group's track has no session that day. */
  lastDays: { date: ISODate; done: boolean | null }[];
  doneLast30: number;
  streak: number;
}

export interface GroupView {
  id: string;
  name: string;
  track: TrackTemplate;
  role: Membership['role'];
  driveFileId: string;
  members: MemberView[];
  error?: string;
}

function memberKey(memberId: string): string {
  return `member:${memberId}`;
}

function templateTrack(t: TrackTemplate): StudyTrack {
  return { ...t, id: 'group', reminders: [], archived: false, deleted: false, hlc: '' };
}

function sameContent(a: GroupRecord | undefined, b: Omit<GroupMember, 'hlc'>): boolean {
  if (!a || a.kind !== 'member') return false;
  const { hlc: _hlc, ...rest } = a;
  const norm = (m: Omit<GroupMember, 'hlc'>) =>
    JSON.stringify([m.displayName, m.left, Object.keys(m.recent).sort()]);
  return norm(rest) === norm(b);
}

export function memberStats(track: TrackTemplate, member: GroupMember, today: ISODate, days = 7) {
  const t = templateTrack(track);
  const lastDays: MemberView['lastDays'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    lastDays.push({ date, done: sessionOn(t, date) ? member.recent[date] === true : null });
  }
  let doneLast30 = 0;
  for (let i = 0; i < 30; i++) if (member.recent[addDays(today, -i)]) doneLast30++;
  let streak = 0;
  for (let i = 0; i < GROUP_WINDOW_DAYS; i++) {
    const date = addDays(today, -i);
    if (!sessionOn(t, date)) continue;
    if (member.recent[date]) streak++;
    else if (i > 0) break;
  }
  return { lastDays, doneLast30, streak };
}

/**
 * Study groups on Drive alone. Each group is one shared file holding a section
 * per member. A section is a projection of that member's private progress, so
 * a section lost to a write race or damaged by another member is simply
 * republished on its owner's next sync.
 */
export class GroupManager {
  private cache = new Map<string, CachedGroup>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly repo: Repository,
    private readonly store: LocalStorePort,
    private readonly files: GroupFilePort,
    private readonly today: () => ISODate,
  ) {}

  async load(): Promise<void> {
    for (const key of await this.store.keys()) {
      if (!key.startsWith(CACHE_PREFIX)) continue;
      const cached = await this.store.get<CachedGroup>(key);
      try {
        if (cached) this.cache.set(key.slice(CACHE_PREFIX.length), { ...cached, doc: parseGroupDoc(cached.doc) });
      } catch {
        // Unreadable cache entry: it will be re-downloaded.
      }
    }
    this.emit();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getRevision = (): number => this.revision;

  // ---- reads -------------------------------------------------------------

  groups(): GroupView[] {
    const out: GroupView[] = [];
    const today = this.today();
    for (const [id, m] of Object.entries(this.repo.memberships())) {
      if (m.left) continue;
      const cached = this.cache.get(id);
      const meta = cached?.doc.records.meta;
      if (!cached || meta?.kind !== 'meta') continue;
      const members: MemberView[] = [];
      for (const [key, rec] of Object.entries(cached.doc.records)) {
        if (rec.kind !== 'member' || rec.left) continue;
        const memberId = key.slice('member:'.length);
        members.push({
          memberId,
          displayName: rec.displayName,
          isMe: memberId === m.memberId,
          ...memberStats(meta.track, rec, today),
        });
      }
      members.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.displayName.localeCompare(b.displayName));
      out.push({ id, name: meta.name, track: meta.track, role: m.role, driveFileId: m.driveFileId, members, error: cached.error });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- actions -----------------------------------------------------------

  async createGroup(input: { name: string; displayName: string; trackId: string }): Promise<string> {
    const track = this.repo.track(input.trackId);
    if (!track) throw new Error('Track not found');
    const id = `g_${crypto.randomUUID()}`;
    const memberId = `m_${crypto.randomUUID()}`;
    const meta: GroupMeta = {
      kind: 'meta',
      id,
      name: input.name.trim(),
      track: { title: track.title, color: track.color, schedule: track.schedule, link: track.link },
      hlc: this.repo.clock.tick(),
    };
    const doc = parseGroupDoc({
      schemaVersion: SCHEMA_VERSION,
      records: { meta, [memberKey(memberId)]: this.projection(input.displayName, input.trackId) },
    });
    const file = await this.files.create(`Kavanu group - ${meta.name}`, doc);
    await this.repo.saveMembership(id, { driveFileId: file.id, memberId, role: 'owner', trackId: track.id, left: false });
    await this.setCache(id, { doc, version: file.version });
    return id;
  }

  /** Read a group file before joining, to show what is being joined. */
  async peek(fileId: string): Promise<{ id: string; name: string; track: TrackTemplate; memberCount: number }> {
    const doc = parseGroupDoc(await this.files.download(fileId));
    const meta = doc.records.meta;
    if (meta?.kind !== 'meta') throw new Error('Not a Kavanu group file');
    const memberCount = Object.values(doc.records).filter((r) => r.kind === 'member' && !r.left).length;
    return { id: meta.id, name: meta.name, track: meta.track, memberCount };
  }

  /** `trackId: null` adopts the group's track as a new local track. */
  async joinGroup(input: { fileId: string; displayName: string; trackId: string | null }): Promise<string> {
    const info = await this.peek(input.fileId);
    const existing = this.repo.memberships()[info.id];
    const trackId = input.trackId ?? (await this.repo.saveTrack({ ...info.track, reminders: [], archived: false })).id;
    await this.repo.setSetting('displayName', input.displayName);
    await this.repo.saveMembership(info.id, {
      driveFileId: input.fileId,
      // Rejoining keeps the same section instead of creating a second one.
      memberId: existing?.memberId ?? `m_${crypto.randomUUID()}`,
      role: existing?.role ?? 'member',
      trackId,
      left: false,
    });
    await this.sync();
    return info.id;
  }

  async leaveGroup(groupId: string): Promise<void> {
    const m = this.repo.memberships()[groupId];
    if (!m) return;
    const cached = this.cache.get(groupId);
    const mine = cached?.doc.records[memberKey(m.memberId)];
    if (cached && mine?.kind === 'member') {
      const doc: GroupDoc = {
        ...cached.doc,
        records: { ...cached.doc.records, [memberKey(m.memberId)]: { ...mine, recent: {}, left: true, hlc: this.repo.clock.tick() } },
      };
      try {
        await this.files.update(m.driveFileId, doc);
      } catch {
        // File already gone or access revoked: nothing left to withdraw.
      }
    }
    await this.repo.saveMembership(groupId, { ...m, left: true });
    this.cache.delete(groupId);
    await this.store.delete(CACHE_PREFIX + groupId);
    this.emit();
  }

  /** Forget a group locally (used after the owner deletes its file). */
  async forgetGroup(groupId: string): Promise<void> {
    const m = this.repo.memberships()[groupId];
    if (m) await this.repo.saveMembership(groupId, { ...m, left: true });
    this.cache.delete(groupId);
    await this.store.delete(CACHE_PREFIX + groupId);
    this.emit();
  }

  sync(): Promise<void> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  // ---- internals ---------------------------------------------------------

  private async run(): Promise<void> {
    for (const [id, m] of Object.entries(this.repo.memberships())) {
      if (m.left) continue;
      try {
        await this.syncGroup(id, m);
      } catch (err) {
        const cached = this.cache.get(id);
        const error = err instanceof Error ? err.message : String(err);
        if (cached) await this.setCache(id, { ...cached, error });
      }
    }
  }

  private async syncGroup(id: string, m: Membership): Promise<void> {
    const cached = this.cache.get(id);
    const displayName = this.repo.setting<string>('displayName', '') || 'Member';
    const mine = this.projection(displayName, m.trackId);
    const key = memberKey(m.memberId);

    const version = await this.files.version(m.driveFileId);
    if (cached && cached.version === version && sameContent(cached.doc.records[key], mine)) {
      if (cached.error) await this.setCache(id, { doc: cached.doc, version });
      return;
    }

    const remote = this.admit(parseGroupDoc(await this.files.download(m.driveFileId)));
    const merged = mergeDocs(cached?.doc ?? { schemaVersion: SCHEMA_VERSION, records: {} }, remote);
    let doc = merged.merged;
    let mustPush = merged.remoteStale;

    // My section is derived from my private progress; whatever the file says, republish the truth.
    if (!sameContent(doc.records[key], mine)) {
      doc = { ...doc, records: { ...doc.records, [key]: { ...mine, hlc: this.repo.clock.tick() } } };
      mustPush = true;
    }

    let newVersion = version;
    if (mustPush) newVersion = (await this.files.update(m.driveFileId, doc)).version;
    await this.setCache(id, { doc, version: newVersion });
  }

  /**
   * Stamps in a shared file come from other people. One far in the future would
   * win every merge forever, so refuse it; otherwise advance our clock past it
   * so that our own next write sorts later.
   */
  private admit(doc: GroupDoc): GroupDoc {
    const limit = Date.now() + 86_400_000;
    for (const rec of Object.values(doc.records)) {
      const { ms } = parseHlc(rec.hlc);
      if (!Number.isFinite(ms) || ms > limit) throw new Error('Group file contains invalid timestamps');
      this.repo.clock.observe(rec.hlc);
    }
    return doc;
  }

  private projection(displayName: string, trackId: string): Omit<GroupMember, 'hlc'> & { hlc: string } {
    const recent: Record<string, true> = {};
    const today = this.today();
    for (let i = GROUP_WINDOW_DAYS - 1; i >= 0; i--) {
      const date = addDays(today, -i);
      if (this.repo.isDone(trackId, date)) recent[date] = true;
    }
    return { kind: 'member', displayName: displayName.trim().slice(0, 60) || 'Member', recent, left: false, hlc: this.repo.clock.tick() };
  }

  private async setCache(id: string, value: CachedGroup): Promise<void> {
    this.cache.set(id, value);
    await this.store.set(CACHE_PREFIX + id, value);
    this.emit();
  }

  private emit(): void {
    this.revision++;
    for (const l of this.listeners) l();
  }
}
