## Project: AzKavanu (אז קבענו)

Study tracking and scheduling with **no backend**. Every byte of user data lives on the
user's device (IndexedDB) and, when they connect it, in their own Google Drive. There is no
server of ours that could read it, and there must never be one.

### Layout
- `packages/core/` — platform-free TypeScript: model and Zod schemas, schedule engine, links,
  CRDT merge, sync engine, groups, reminder planner. No DOM, no platform APIs.
- `apps/web/` — React PWA (Vite) and the browser adapters in `src/platform/`.
- `apps/web/android/` — Capacitor project wrapping the web build.
- `.ai/` — ogen-ai submodule (this config). Don't edit files under `.ai/` from this repo.

### Commands
- `npm ci`, then `npm run typecheck && npm test && npm run build` (all must pass before a commit)
- APK locally: `npm run build && (cd apps/web && npx cap sync android) && (cd apps/web/android && ./gradlew assembleDebug)`
- Regenerate the repo map after adding, renaming or deleting a file: `python .ai/skills/repo-tree/gen_tree.py --project .`
- Regenerate AI config after editing `ai-config.*`: `python .ai/bin/ai-sync`

### Invariants
- **No backend.** Don't add a server, a database, analytics or any third-party script beyond
  Google's own sign-in, Drive and Picker.
- **Drive scopes stay `drive.appdata` + `drive.file`.** Both are non-sensitive; any broader
  Drive scope is restricted and needs a yearly security assessment.
- **Drive content is untrusted input.** Every document is parsed with its Zod schema
  (`parseDoc`, `parseGroupDoc` in `packages/core/src/model.ts`) before it is merged. A document
  that fails validation is left untouched, never overwritten.
- **Merges converge under blind overwrites.** Drive has no conditional writes. Synced data is
  per-record last-writer-wins on HLC stamps (`crdt.ts`, `hlc.ts`); deletes are tombstones.
  A change to a document's shape bumps `SCHEMA_VERSION` and keeps older documents readable.
- **`core` stays pure.** Platform code goes behind a port (`ports.ts`, `GroupFilePort`) with
  an adapter in `apps/web/src/platform/`; core tests use the in-memory doubles in `memory.ts`.
- **Every user-facing string goes through `apps/web/src/i18n.ts`** in English and Hebrew;
  layouts must work right-to-left.
- Access tokens stay in memory on the web; never write them to storage or logs.

### Conventions
- **Never add Claude attribution** to commits or PRs: no `Co-Authored-By: Claude`, no session/chat URL.
- Commit as `joka-7 <255956958+joka-7@users.noreply.github.com>`.
- The README is in English.
