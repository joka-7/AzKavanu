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
- Study groups: one shared Drive file per group, invitations by email, a seven-day view of each member's progress

Not yet implemented: the Google Calendar reminder mirror, signed group sections, the Android and desktop shells.

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
2. Configure the OAuth consent screen with the scopes `https://www.googleapis.com/auth/drive.appdata` and `https://www.googleapis.com/auth/drive.file`.
3. Create an OAuth client ID of type **Web application** and add your origins (for example `http://localhost:5173`) under *Authorized JavaScript origins*.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and set `VITE_GOOGLE_CLIENT_ID`.

Joining a group that someone else created also needs the Google Picker, so that the user can grant the app access to that one shared file:

5. Enable the **Google Picker API**, create an API key restricted to it, and set `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` (the Cloud project number).

The sync and group logic is covered by unit tests and by a browser test against a simulated Drive API; none of it has yet been run against a real Google account, and the Picker step of joining a group is not exercised by any test.
