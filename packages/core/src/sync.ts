import { mergeDocs } from './crdt';
import { SchemaTooNewError, docKind, parseDoc } from './model';
import type { DrivePort, LocalStorePort, RemoteFile } from './ports';
import type { Repository } from './repository';

const STATE_KEY = 'meta:sync';

interface DocSyncState {
  fileId: string;
  version: string;
}

export interface SyncReport {
  pulled: string[];
  pushed: string[];
  /** Documents left untouched because they could not be read safely. */
  errors: { name: string; message: string; needsClientUpdate: boolean }[];
}

/**
 * Reconciles the local replica with Drive.
 *
 * Drive offers no conditional writes, so an upload may silently overwrite a
 * concurrent upload from another device. That is safe here: every replica
 * keeps full state, so the overwritten device notices on its next cycle that
 * the remote copy lacks its records and pushes the union again.
 */
export class SyncEngine {
  private inFlight: Promise<SyncReport> | null = null;

  constructor(
    private readonly repo: Repository,
    private readonly drive: DrivePort,
    private readonly store: LocalStorePort,
  ) {}

  sync(): Promise<SyncReport> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<SyncReport> {
    const report: SyncReport = { pulled: [], pushed: [], errors: [] };
    const state = (await this.store.get<Record<string, DocSyncState>>(STATE_KEY)) ?? {};

    const remoteByName = new Map<string, RemoteFile[]>();
    for (const f of await this.drive.list()) {
      if (!docKind(f.name)) continue;
      const list = remoteByName.get(f.name) ?? [];
      list.push(f);
      remoteByName.set(f.name, list);
    }
    // Two devices creating the same document at once leaves duplicates; pick a deterministic primary.
    for (const list of remoteByName.values()) list.sort((a, b) => (a.id < b.id ? -1 : 1));

    const names = new Set([...this.repo.docNames(), ...remoteByName.keys()]);
    for (const name of names) {
      try {
        await this.syncDoc(name, remoteByName.get(name) ?? [], state, report);
      } catch (err) {
        report.errors.push({
          name,
          message: err instanceof Error ? err.message : String(err),
          needsClientUpdate: err instanceof SchemaTooNewError,
        });
      }
    }

    await this.store.set(STATE_KEY, state);
    return report;
  }

  private async syncDoc(
    name: string,
    remotes: RemoteFile[],
    state: Record<string, DocSyncState>,
    report: SyncReport,
  ): Promise<void> {
    const primary = remotes[0];
    const known = state[name];
    const unchanged =
      remotes.length === 1 && known !== undefined && known.fileId === primary!.id && known.version === primary!.version;

    let mustPush = primary === undefined;

    if (primary && !unchanged) {
      let local = this.repo.getDoc(name);
      let localChanged = false;
      for (const file of remotes) {
        // A document that fails validation aborts here, before anything is overwritten.
        const remote = parseDoc(name, await this.drive.download(file.id));
        const result = mergeDocs(local, remote);
        local = result.merged;
        localChanged ||= result.localChanged;
        if (file === primary) mustPush ||= result.remoteStale;
      }
      if (remotes.length > 1) mustPush = true;
      // Re-merge with the live replica in case the user edited during the downloads.
      const final = mergeDocs(this.repo.getDoc(name), local);
      if (localChanged || final.localChanged) {
        await this.repo.applyMerged(name, final.merged);
        report.pulled.push(name);
      }
      state[name] = { fileId: primary.id, version: primary.version };
    }

    if (mustPush || this.repo.isDirty(name)) {
      // Clear first: an edit made while the upload is in flight re-marks the document.
      await this.repo.setDirty(name, false);
      try {
        const content = this.repo.getDoc(name);
        const saved = primary ? await this.drive.update(primary.id, content) : await this.drive.create(name, content);
        state[name] = { fileId: saved.id, version: saved.version };
        report.pushed.push(name);
      } catch (err) {
        await this.repo.setDirty(name, true);
        throw err;
      }
      for (const dup of remotes.slice(1)) await this.drive.remove(dup.id);
    }
  }
}
