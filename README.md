# Kavanu

Study tracking and scheduling with no backend: your data lives in your own Google Drive, and the app works offline.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Status

Implemented (architecture phases 1a and 1b):

- Study tracks: Daf Yomi, Mishna Yomi, numbered units (chapters, pages, lessons) and recurring sessions, daily or on chosen weekdays
- Calendar with per-day check-off, Hebrew dates and streaks
- Daily links: built-in Sefaria links for the fixed cycles, URL templates for everything else
- Local-first storage in IndexedDB, installable as a PWA, English and Hebrew (RTL)
- Google Drive sync into the hidden app-data folder, with per-record merge between devices
- Reminders while the app is open

Not yet implemented: study groups, the Google Calendar reminder mirror, the Android and desktop shells.

## Layout

| Path | Contents |
|---|---|
| `packages/core` | Platform-free TypeScript: data model, schedule engine, link resolver, merge, sync engine, reminder planner |
| `apps/web` | React PWA and the browser adapters (IndexedDB, Google sign-in, Drive, notifications) |

## Running

```sh
npm install
npm run dev        # web app at http://localhost:5173
npm test           # core unit tests
npm run typecheck
npm run build      # static site in apps/web/dist
```

## Enabling Google Drive sync

Without configuration the app runs in local-only mode. To enable sync:

1. In Google Cloud Console, create a project and enable the **Google Drive API**.
2. Configure the OAuth consent screen with the scope `https://www.googleapis.com/auth/drive.appdata`.
3. Create an OAuth client ID of type **Web application** and add your origins (for example `http://localhost:5173`) under *Authorized JavaScript origins*.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_GOOGLE_CLIENT_ID`.

The sync logic is covered by unit tests and by a browser test against a simulated Drive API; it has not yet been run against a real Google account.
