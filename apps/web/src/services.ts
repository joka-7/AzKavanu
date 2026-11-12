import {
  GroupManager,
  MemoryStore,
  Repository,
  SyncEngine,
  planReminders,
  toISODate,
  type LocalStorePort,
  type SyncReport,
} from '@kavanu/core';
import { AuthRequiredError, GoogleAuth } from './platform/googleAuth';
import { GoogleDrive } from './platform/googleDrive';
import { GoogleGroupFiles } from './platform/googleGroupFiles';
import { IdbStore } from './platform/idbStore';
import { WebNotifier } from './platform/notifications';

export type SyncStatus =
  | { state: 'unconfigured' }
  | { state: 'disconnected' }
  | { state: 'needsReconnect' }
  | { state: 'syncing' }
  | { state: 'synced'; at: number; report: SyncReport }
  | { state: 'offline' }
  | { state: 'accountMismatch' }
  | { state: 'error'; message: string };

const CONNECTED_FLAG = 'kavanu.driveConnected';
const ACCOUNT_KEY = 'meta:account';
const DEBOUNCE_MS = 3000;
const INTERVAL_MS = 5 * 60_000;

/** Owns Drive connection state and decides when to run the sync engine. */
export class SyncController {
  private status: SyncStatus;
  private listeners = new Set<() => void>();
  private auth: GoogleAuth | null = null;
  private drive: GoogleDrive | null = null;
  private engine: SyncEngine | null = null;
  /** Present only when a Google client ID is configured. */
  groups: GroupManager | null = null;
  groupFiles: GoogleGroupFiles | null = null;
  /** Drive permission id of the connected account, once known. */
  accountId: string | null = null;
  private debounce: number | undefined;
  private lastRevisionSynced = -1;

  constructor(
    private readonly repo: Repository,
    private readonly store: LocalStorePort,
    clientId: string | undefined,
  ) {
    if (!clientId) {
      this.status = { state: 'unconfigured' };
      return;
    }
    this.auth = new GoogleAuth(clientId);
    this.drive = new GoogleDrive(() => this.auth!.getAccessToken(false));
    this.engine = new SyncEngine(repo, this.drive, store);
    this.groupFiles = new GoogleGroupFiles(() => this.auth!.getAccessToken(false));
    this.groups = new GroupManager(repo, store, this.groupFiles, () => toISODate(new Date()));
    this.status = { state: localStorage.getItem(CONNECTED_FLAG) ? 'needsReconnect' : 'disconnected' };

    repo.subscribe(() => this.schedule());
    window.addEventListener('online', () => void this.syncNow());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncNow();
    });
    window.setInterval(() => void this.syncNow(), INTERVAL_MS);
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getStatus = (): SyncStatus => this.status;

  get connected(): boolean {
    return !!localStorage.getItem(CONNECTED_FLAG);
  }

  /** Call from a click handler: may open Google's consent popup. */
  async connect(): Promise<void> {
    if (!this.auth) return;
    try {
      await this.auth.getAccessToken(true);
      localStorage.setItem(CONNECTED_FLAG, '1');
      await this.syncNow();
    } catch (err) {
      this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  async disconnect(): Promise<void> {
    localStorage.removeItem(CONNECTED_FLAG);
    await this.auth?.signOut();
    this.set({ state: 'disconnected' });
  }

  /** Silent attempt at startup; falls back to asking the user to reconnect. */
  async resume(): Promise<void> {
    if (this.connected) await this.syncNow();
  }

  async syncNow(): Promise<void> {
    if (!this.engine || !this.drive || !this.connected || this.status.state === 'syncing') return;
    if (this.status.state === 'accountMismatch') return;
    if (!navigator.onLine) return this.set({ state: 'offline' });
    this.set({ state: 'syncing' });
    try {
      const account = await this.drive.accountId();
      const bound = await this.store.get<string>(ACCOUNT_KEY);
      if (bound && bound !== account) return this.set({ state: 'accountMismatch' });
      if (!bound) await this.store.set(ACCOUNT_KEY, account);
      this.accountId = account;

      const revision = this.repo.getRevision();
      const report = await this.engine.sync();
      await this.groups?.sync();
      this.lastRevisionSynced = report.pulled.length ? this.repo.getRevision() : revision;
      this.set({ state: 'synced', at: Date.now(), report });
      if (this.repo.getRevision() !== this.lastRevisionSynced) this.schedule();
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        this.auth?.invalidate();
        this.set({ state: 'needsReconnect' });
      } else {
        this.set({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  /** A current access token, for Google UI components such as the Picker. */
  token(): Promise<string> {
    if (!this.auth) throw new Error('Google Drive is not configured');
    return this.auth.getAccessToken(false);
  }

  private schedule(): void {
    if (!this.connected) return;
    clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => void this.syncNow(), DEBOUNCE_MS);
  }

  private set(status: SyncStatus): void {
    this.status = status;
    for (const l of this.listeners) l();
  }
}

export interface Services {
  repo: Repository;
  sync: SyncController;
  notifier: WebNotifier;
  replanReminders(): void;
}

function deviceId(): string {
  const key = 'kavanu.deviceId';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `web_${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export async function createServices(): Promise<Services> {
  let store: LocalStorePort;
  try {
    store = await IdbStore.open();
  } catch {
    store = new MemoryStore(); // Private browsing without IndexedDB: works for this session only.
  }
  const id = deviceId();
  const repo = new Repository(store, id);
  await repo.load();

  if (!repo.manifestValue(`device:${id}`)) {
    await repo.setManifestValue(`device:${id}`, { platform: 'web', label: navigator.userAgent.slice(0, 120) });
  }

  const notifier = new WebNotifier();
  const replanReminders = () =>
    notifier.reconcile(
      planReminders(repo.tracks(), repo.isDone, new Date(), { windowDays: 2, locale: repo.setting('locale', 'en') }),
    );
  repo.subscribe(replanReminders);
  window.setInterval(replanReminders, 60 * 60_000);
  replanReminders();

  const sync = new SyncController(repo, store, import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined);
  await sync.groups?.load();
  void sync.resume();

  return { repo, sync, notifier, replanReminders };
}
