import { compareHlc, type Hlc } from './hlc';

export interface Stamped {
  hlc: Hlc;
}

export interface RecordDoc<T extends Stamped = Stamped> {
  schemaVersion: number;
  records: Record<string, T>;
}

export interface MergeResult<T extends Stamped> {
  merged: RecordDoc<T>;
  /** Remote contributed something local did not have: the local replica must be updated. */
  localChanged: boolean;
  /** Local contributed something remote did not have: the merged state must be uploaded. */
  remoteStale: boolean;
}

/**
 * Per-record last-writer-wins merge. Commutative, associative and idempotent,
 * so replicas converge regardless of the order or number of merges.
 */
export function mergeDocs<T extends Stamped>(local: RecordDoc<T>, remote: RecordDoc<T>): MergeResult<T> {
  const records: Record<string, T> = {};
  let localChanged = false;
  let remoteStale = false;

  for (const [key, l] of Object.entries(local.records)) {
    const r = remote.records[key];
    if (!r) {
      records[key] = l;
      remoteStale = true;
      continue;
    }
    const cmp = compareHlc(l.hlc, r.hlc);
    if (cmp > 0) {
      records[key] = l;
      remoteStale = true;
    } else if (cmp < 0) {
      records[key] = r;
      localChanged = true;
    } else {
      records[key] = l;
    }
  }
  for (const [key, r] of Object.entries(remote.records)) {
    if (!(key in local.records)) {
      records[key] = r;
      localChanged = true;
    }
  }

  return {
    merged: { schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion), records },
    localChanged,
    remoteStale,
  };
}

export function emptyDoc<T extends Stamped>(schemaVersion: number): RecordDoc<T> {
  return { schemaVersion, records: {} };
}
