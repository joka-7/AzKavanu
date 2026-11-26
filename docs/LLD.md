# Low-level design

Per-module contracts for the code as it is. The system view is in [`HLD.md`](HLD.md); the file
map in [`STRUCTURE.md`](STRUCTURE.md).

## Ports (`packages/core/src/ports.ts`, `groups.ts`)

```ts
interface RemoteFile { id: string; name: string /* without .json */; version: string }

interface DrivePort {            // the app-data folder
  list(): Promise<RemoteFile[]>;
  download(id: string): Promise<unknown>;
  create(name: string, content: unknown): Promise<RemoteFile>;
  update(id: string, content: unknown): Promise<RemoteFile>;
  remove(id: string): Promise<void>;
}

interface LocalStorePort {       // durable key-value store
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

interface GroupFilePort {        // shared group files (excerpt)
  create(name: string, content: unknown): Promise<{ id: string; version: string }>;
  version(id: string): Promise<string>;      // rejects if gone or access revoked
  download(id: string): Promise<unknown>;
  update(id: string, content: unknown): Promise<{ version: string }>;
}
```

| Port | Browser adapter | Test double |
|---|---|---|
| `DrivePort` | `GoogleDrive` (`platform/googleDrive.ts`) | `MemoryDrive` |
| `LocalStorePort` | `IdbStore` (`platform/idbStore.ts`) | `MemoryStore` |
| `GroupFilePort` | `GoogleGroupFiles` (`platform/googleGroupFiles.ts`) | `MemoryGroupFiles` |

## Documents (`model.ts`, `crdt.ts`)

Every synced document is a `RecordDoc`: `{ schemaVersion, records: Record<key, T & { hlc }> }`.
The document name is also its Drive file name.

| Name (`docKind`) | Record key | Record schema |
|---|---|---|
| `manifest` | `device:<id>` and other keys | `manifestRecordSchema` (`value`) |
| `settings` | setting key | `settingSchema` (`value`) |
| `tracks` | track id | `trackSchema` (schedule, link, reminders, `deleted`) |
| `progress-<yyyy>` | `progressKey(trackId, date)` = `trackId\|YYYY-MM-DD` | `progressSchema` |
| `groups` | group id | `membershipSchema` (file id, role, member id, track, `left`) |
| `group-<id>` (shared) | `meta` or a member key | `groupRecordSchema`, a union on `kind: 'meta' \| 'member'`; at most 201 records |

`SCHEMA_VERSION` is 1. `parseDoc(name, raw)` / `parseGroupDoc(raw)` throw `SchemaTooNewError`
for a newer version and a Zod error for a malformed one.

## HLC (`hlc.ts`)

A stamp is the string `<ms:15 digits>-<counter:5 digits>-<deviceId>`, so string comparison
orders stamps. `HlcClock.tick()` returns a stamp greater than any issued or observed;
`observe(stamp)` moves the clock past a remote stamp. `Repository.load()` observes every stored
record, so a device with a slow clock still stamps its next edit after what it has seen.

## Merge (`crdt.ts`)

`mergeDocs(local, remote)` keeps, per key, the record with the greater `hlc` (local on a tie)
and returns `{ merged, localChanged, remoteStale }`:

- `localChanged`: remote contributed a record, so the replica must be updated.
- `remoteStale`: local contributed one, so the merged state must be uploaded.

Commutative, associative and idempotent. Deletes and un-ticks are records with a newer stamp
(`deleted: true`, `done: false`), never removals.

## Repository (`repository.ts`)

Owns the in-memory documents, persists each to the store under a `doc:` key, and keeps the set
of dirty (unsynced) document names. Writes (`saveTrack`, `deleteTrack`, `setDone`,
`setSetting`, `saveMembership`, `setManifestValue`) stamp the record with `clock.tick()`, mark
the document dirty and notify subscribers. `getRevision()` changes on every mutation and is the
`useSyncExternalStore` snapshot. The sync engine uses `docNames`, `getDoc`, `isDirty`,
`setDirty` and `applyMerged`.

## Sync cycle (`sync.ts`)

`SyncEngine.sync()` returns the run in flight if there is one, so callers never overlap.

```
state ← store["meta:sync"]          // per document: last seen { fileId, version }
remote ← drive.list() grouped by name, ids sorted (duplicates: lowest id is primary)
for name in local names ∪ remote names:
  if remote exists and (several files, or fileId/version differ from state):
    merged ← local
    for each remote file: merged ← mergeDocs(merged, parseDoc(download(file)))
    final ← mergeDocs(repo.getDoc(name), merged)      // edits made during the downloads
    if anything new: repo.applyMerged(name, final)
    mustPush ← remote stale, or duplicates existed
  if no remote, or mustPush, or dirty:
    setDirty(false)                  // an edit during upload re-marks it
    upload (update primary or create); on failure setDirty(true) and rethrow
    remove duplicate files
  errors for one document are recorded and the others continue
store["meta:sync"] ← state
```

Returns `SyncReport { pulled, pushed, errors[{ name, message, needsClientUpdate }] }`.

## Groups (`groups.ts`)

`GroupManager` keeps a cached copy of each group file under `group:<id>` keys. Its `sync()`
walks the user's memberships that haven't been left, computes the user's own section (a
projection of the chosen track's last `GROUP_WINDOW_DAYS` = 60 days), checks the file's
`version`, and downloads, merges and uploads only when the file or the section changed. A
failing group keeps its cached view with an `error`. `createGroup`, `peek`, `joinGroup`
(throws `GroupFullError` past `maxMembers`, 2–100), `leaveGroup` and `forgetGroup` are the
user actions. Sharing is Drive permissions, by email, managed in `GoogleGroupFiles`.

## Reminders (`reminders.ts`, `platform/notifications.ts`)

`planReminders(tracks, contextFor, now, { windowDays, locale })` returns `DesiredNotification[]`,
each with a stable `id` so a scheduler can diff. `Notifier.reconcile(desired)` cancels and
schedules the difference.

| Notifier | `background` | `windowDays` | Mechanism |
|---|---|---|---|
| `WebNotifier` | false | 2 | One timer per notification while the page is open |
| native (Capacitor) | true | 14 | `@capacitor/local-notifications` |

## Web composition (`apps/web/src/services.ts`)

`createServices()` is the composition root: it opens `IdbStore` (falling back to
`MemoryStore`), makes a per-browser device id, loads the `Repository`, wires reminder
replanning, and builds a `SyncController` with the token source from `createAuth` (none when no Google client ID is configured).

`SyncController` status is a discriminated union: `unconfigured`, `disconnected`,
`needsReconnect`, `syncing`, `synced`, `offline`, `accountMismatch`, `error`. Before syncing it
binds the local replica to the Drive account (`meta:account`) and stops with
`accountMismatch` if a different account connects, so two people's data never merge.

Tokens come from an `AccessTokenSource` (`getAccessToken(interactive)`, `invalidate`,
`signOut`), chosen in `createAuth`:

| Source | Platform | Behaviour |
|---|---|---|
| `GoogleAuth` | Browser | Google Identity Services' token model: tokens of about an hour, in memory only, renewed silently when Google allows it |
| `NativeGoogleAuth` | Android | `@joka-07/capacitor-auth` over Credential Manager, asking for `drive.appdata`, `drive.file`, `email` and `profile`. Android renews a granted token without the user, 5 s before expiry; if the grant was removed, even a silent renewal shows Google's consent screen. Network and token-check failures stay ordinary errors |

Both raise `AuthRequiredError` when Google needs the user again, which becomes
`needsReconnect`. A 401 from Drive also raises `AuthRequiredError`; other failures raise
`DriveHttpError` with the status. A failed sign-out on disconnect is logged and does not stop
the disconnect. On Android the sign-in plugin keeps tokens in a SharedPreferences file that the
backup rules (`res/xml/backup_rules.xml`, `data_extraction_rules.xml`) exclude from backups.

## Errors

Core throws typed errors (`SchemaTooNewError`, `GroupFullError`, Zod errors). The sync engine
turns per-document failures into `SyncReport.errors`; `SyncController` turns everything else
into a status the UI shows. No error is swallowed silently except an unreadable local document
at load, which is skipped with a console warning so the app still opens.

## Tests

`packages/core/test/{core,sync,groups}.test.ts` (Vitest) cover schedules, links, merge, the
sync cycle with several devices sharing one `MemoryDrive`, and groups through
`MemoryGroupFiles`. Run with `npm test`.
