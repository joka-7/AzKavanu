# Repository structure

Every file in this repo and what is inside it. The tree below is **generated** —
run `python .ai/skills/repo-tree/gen_tree.py --project . --output docs/STRUCTURE.md`
to refresh it, and never edit between the markers by hand.

<!-- BEGIN GENERATED TREE (depth=6 entries=all) -->
```text
AzKavanu/
├── .claude/                                      # Copied from .ai by ai-sync; regenerate, don't edit
│   ├── agents/
│   │   ├── .ai-managed
│   │   ├── architect.md                          # Reviews a target repo's structure and reports coupling, module boundaries,…
│   │   ├── ciso.md                               # Reviews a target repo for security exposure and reports hardcoded secrets,…
│   │   ├── developer.md                          # Implements specific, already-approved backlog items in a target repo — the…
│   │   ├── docs-sync.md                          # Keeps a target repo's documentation — in-code docs (README, docs/*.md,…
│   │   ├── engineering-manager.md                # Reviews a target repo's delivery health and reports CI gates, commit and PR…
│   │   ├── frontend.md                           # Reviews a target repo's user interface code and reports accessibility…
│   │   ├── performance.md                        # Reviews a target repo's hot paths and reports N+1 queries, unbounded work,…
│   │   ├── planner.md                            # Aggregates the completed role reports in .ai-reviews/ into one prioritized…
│   │   ├── privacy.md                            # Reviews a target repo's handling of personal data and reports PII collection…
│   │   ├── product.md                            # Reviews a target repo from the user's side and reports docs-vs-behavior…
│   │   ├── qa.md                                 # Reviews a target repo's test suite and reports test coverage, isolation, mock…
│   │   ├── senior-dev.md                         # Reviews a target repo's line-level code quality and reports correctness…
│   │   ├── sre.md                                # Reviews a target repo's operability and reports healthchecks, graceful…
│   │   └── tracker.md                            # Keeps a target repo's Jira project in sync with its review backlog and…
│   ├── commands/
│   │   ├── .ai-managed
│   │   ├── docs-bootstrap.md                     # Create a target repo's standard doc set from scratch
│   │   ├── review.md                             # Review the current diff against this repo's coding rules
│   │   ├── role-backlog.md                       # Re-aggregate the role reports already on disk into a fresh prioritized…
│   │   ├── role-implement.md                     # Implement specific, already-approved items from .ai-reviews/BACKLOG.md by…
│   │   ├── role-review.md                        # Run a full multi-role review over a target repo (local path or git URL) and…
│   │   ├── role.md                               # Run a single role agent (qa, architect, product, engineering-manager, sre,…
│   │   ├── sync-docs.md                          # Sync a target repo's in-code documentation and Confluence space with the…
│   │   ├── sync-tracker.md                       # Sync a target repo's review backlog and implementation status to Jira via the…
│   │   └── test.md                               # Write or extend tests for the code in $ARGUMENTS following the testing rules
│   └── skills/
│       ├── add-logging/
│       │   └── SKILL.md                          # Add or fix logging in code using the project's language-idiomatic structured…
│       ├── audit-repo/
│       │   ├── SKILL.md                          # Scan a target project and produce a scored (0-100) health report,…
│       │   └── run_audit.py                      # Collect objective repository-health signals for the audit-repo skill.
│       ├── conventional-commit/
│       │   └── SKILL.md                          # Write a Conventional Commits-formatted git commit message from staged changes
│       ├── customize-config/
│       │   ├── SKILL.md                          # Scaffold and apply ai-project-config.toml — a project-local override file for…
│       │   └── init_config.py                    # Scaffold `ai-project-config.toml` for the customize-config skill.
│       ├── db-migration-safety/
│       │   └── SKILL.md                          # Write or review a database schema migration so it is safe to deploy —…
│       ├── debug-root-cause/
│       │   └── SKILL.md                          # Find and fix the root cause of a bug instead of patching its symptom —…
│       ├── dependency-upgrade/
│       │   └── SKILL.md                          # Upgrade a project's dependencies safely — read the changelog and breaking…
│       ├── engineering-guides/
│       │   ├── reference/
│       │   │   ├── cpp/
│       │   │   │   ├── architecture-guide-detailed.md  # C++ — Architecture & Framework Design Guide (Detailed)
│       │   │   │   ├── architecture-guide-short.md  # C++ — Architecture & Framework Design Guide (Short)
│       │   │   │   ├── coding-guide-detailed.md  # C++ — Coding Implementation Guide (Detailed)
│       │   │   │   ├── coding-guide-short.md     # C++ — Coding Implementation Guide (Short)
│       │   │   │   ├── testing-guide-detailed.md  # C++ — Testing Guide (Detailed)
│       │   │   │   └── testing-guide-short.md    # C++ — Testing Guide (Short)
│       │   │   ├── general/
│       │   │   │   ├── architecture-principles-detailed.md  # General Architecture Principles (Detailed)
│       │   │   │   ├── architecture-principles-short.md  # General Architecture Principles (Short)
│       │   │   │   ├── coding-principles-detailed.md  # General Coding Principles (Detailed)
│       │   │   │   ├── coding-principles-short.md  # General Coding Principles (Short)
│       │   │   │   ├── documentation-principles-detailed.md  # General Documentation Principles (Detailed)
│       │   │   │   ├── documentation-principles-short.md  # General Documentation Principles (Short)
│       │   │   │   ├── testing-principles-detailed.md  # General Testing Principles (Detailed)
│       │   │   │   └── testing-principles-short.md  # General Testing Principles (Short)
│       │   │   ├── python/
│       │   │   │   ├── architecture-guide-detailed.md  # Python — Architecture & Framework Design Guide (Detailed)
│       │   │   │   ├── architecture-guide-short.md  # Python — Architecture & Framework Design Guide (Short)
│       │   │   │   ├── coding-guide-detailed.md  # Python — Coding Implementation Guide (Detailed)
│       │   │   │   ├── coding-guide-short.md     # Python — Coding Implementation Guide (Short)
│       │   │   │   ├── testing-guide-detailed.md  # Python — Testing Guide (Detailed)
│       │   │   │   └── testing-guide-short.md    # Python — Testing Guide (Short)
│       │   │   └── typescript/
│       │   │       ├── architecture-guide-detailed.md  # TypeScript — Architecture & Framework Design Guide (Detailed)
│       │   │       ├── architecture-guide-short.md  # TypeScript — Architecture & Framework Design Guide (Short)
│       │   │       ├── coding-guide-detailed.md  # TypeScript — Coding Implementation Guide (Detailed)
│       │   │       ├── coding-guide-short.md     # TypeScript — Coding Implementation Guide (Short)
│       │   │       ├── testing-guide-detailed.md  # TypeScript — Testing Guide (Detailed)
│       │   │       └── testing-guide-short.md    # TypeScript — Testing Guide (Short)
│       │   └── SKILL.md                          # Look up the full engineering guides for coding, architecture, testing, and…
│       ├── lesson-capture/
│       │   └── SKILL.md                          # Turn a correction into a written rule instead of just a memory for this…
│       ├── port-module/
│       │   └── SKILL.md                          # Port a module from one language to another (for example JS or Python to…
│       ├── pr-description/
│       │   └── SKILL.md                          # Write a clear pull request title and description from the actual diff — what…
│       ├── release-checklist/
│       │   └── SKILL.md                          # Walk through cutting a release — determine the version bump from commits…
│       ├── repo-tree/
│       │   ├── SKILL.md                          # Generate or refresh a repository's annotated file tree — the map of which…
│       │   └── gen_tree.py                       # Render an annotated file tree of a repository into a docs file.
│       ├── role-review/
│       │   ├── SKILL.md                          # The shared output contract for the role agents (qa, architect, product,…
│       │   └── run_manifest.py                   # Track role-review runs in a target repo's .ai-reviews/ directory.
│       ├── scaffold-python-service/
│       │   ├── template/                         # Scaffold template
│       │   │   ├── src/
│       │   │   │   └── example_service/
│       │   │   ├── tests/
│       │   │   │   └── test_smoke.py             # One real smoke test exercising the entrypoint end to end, per the skill's…
│       │   │   ├── README.md                     # Scaffold template
│       │   │   └── pyproject.toml
│       │   └── SKILL.md                          # Scaffold a new Python backend service or package with the standard project…
│       ├── threat-model/
│       │   └── SKILL.md                          # Produce a threat model for a feature or system using STRIDE over its data…
│       ├── write-design-doc/
│       │   └── SKILL.md                          # Produce an HLD/LLD design document — either documenting an existing repo's…
│       └── .ai-managed
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug.yml
│   │   └── feature.yml
│   ├── workflows/
│   │   ├── android.yml                           # On main: build, sign with the permanent key and publish AzKavanu.apk as a…
│   │   ├── build.yml                             # CI: typecheck, test and build the web app, build an unsigned debug APK, check…
│   │   ├── pages.yml                             # Deploys the web build to GitHub Pages on every push to main
│   │   └── security.yml                          # Gitleaks, npm audit, Trivy and CodeQL
│   └── dependabot.yml                            # Weekly updates for npm, Actions, Gradle and the .ai submodule
├── apps/
│   └── web/
│       ├── android/                              # Capacitor Android project wrapping the web build
│       │   ├── app/
│       │   │   ├── src/
│       │   │   │   ├── androidTest/
│       │   │   │   ├── main/
│       │   │   │   └── test/
│       │   │   ├── .gitignore
│       │   │   ├── build.gradle
│       │   │   ├── capacitor.build.gradle
│       │   │   └── proguard-rules.pro
│       │   ├── gradle/
│       │   │   └── wrapper/
│       │   │       ├── gradle-wrapper.jar
│       │   │       └── gradle-wrapper.properties
│       │   ├── .gitignore
│       │   ├── build.gradle
│       │   ├── capacitor.settings.gradle
│       │   ├── gradle.properties
│       │   ├── gradlew
│       │   ├── gradlew.bat
│       │   ├── settings.gradle
│       │   └── variables.gradle
│       ├── public/
│       │   ├── icon-192.png
│       │   ├── icon-512.png
│       │   ├── icon.svg
│       │   └── sw-notify.js                      # Service-worker hook: tapping a reminder opens the day's study link
│       ├── src/
│       │   ├── platform/
│       │   │   ├── googleAuth.ts                 # AccessTokenSource contract and the browser's Google Identity Services token…
│       │   │   ├── googleDrive.ts                # DrivePort over the Drive REST API, confined to the app-data folder
│       │   │   ├── googleGroupFiles.ts           # Shared group files in the visible Kavanu folder, and their permissions
│       │   │   ├── idbStore.ts                   # LocalStorePort over one IndexedDB object store
│       │   │   ├── nativeGoogleAuth.ts           # Android: Drive tokens from the OS through @joka-07/capacitor-auth
│       │   │   ├── notifications.ts              # Reminder schedulers: timers in the browser, local notifications on Android
│       │   │   └── picker.ts                     # Google Picker: the one explicit grant needed to join someone else's group
│       │   ├── views/
│       │   │   ├── CalendarView.tsx              # Hebrew or Gregorian month with check-off, holidays and streaks
│       │   │   ├── EventPanel.tsx                # Adds a study to the user's own calendar: details, repeat rule and alert
│       │   │   ├── GroupsView.tsx                # Create, join, invite to and leave study groups
│       │   │   ├── SettingsView.tsx              # Language, Drive connection, reminders, export and reset
│       │   │   └── TracksView.tsx                # Your tracks: adding one from the catalogue or your own, and editing it
│       │   ├── App.tsx                           # App shell: tabs for tracks, calendar, groups and settings
│       │   ├── calendarFile.ts                   # Downloads a track's upcoming reminders as an .ics calendar file
│       │   ├── context.tsx                       # React context and hooks for the services and the local replica
│       │   ├── describe.ts                       # One-line human summaries of schedules; weekday names
│       │   ├── i18n.ts                           # Every user-facing string, in English and Hebrew
│       │   ├── main.tsx                          # Entry point: creates the services and renders the app
│       │   ├── presets.ts                        # Catalogue of track presets shown when adding a track
│       │   ├── services.ts                       # Composition root: local store, repository, SyncController, reminder replanning
│       │   ├── styles.css
│       │   └── vite-env.d.ts
│       ├── .env.example                          # Google client ID, API key and app id (build-time, not secret)
│       ├── capacitor.config.ts                   # Android app id (app.kavanu), name and web build folder
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vercel.json                           # Vercel build settings when apps/web is the project root
│       └── vite.config.ts
├── docs/
│   ├── .structure-notes.toml
│   ├── ARCHITECTURE.md                           # Kavanu — Architecture Document
│   ├── HLD.md                                    # High-level design
│   ├── LLD.md                                    # Low-level design
│   └── STRUCTURE.md                              # Repository structure
├── packages/
│   └── core/                                     # Platform-free TypeScript: model, schedules, merge, sync, groups, reminders
│       ├── src/
│       │   ├── apps.ts                           # Addresses of Shas Radar and Ot va-Ot, and which studies open in each
│       │   ├── calendarEvent.ts                  # Calendar events for a study: repeat rules, end conditions, Google Calendar…
│       │   ├── crdt.ts                           # Per-record last-writer-wins merge of record documents
│       │   ├── curricula.ts                      # Ordered unit lists: Talmud by daf, Mishnah by mishna
│       │   ├── dates.ts                          # Calendar-date (YYYY-MM-DD) helpers
│       │   ├── groups.ts                         # GroupManager: shared group files holding a section per member
│       │   ├── hlc.ts                            # Hybrid logical clock stamps that sort as strings
│       │   ├── ics.ts                            # ICalendar (.ics) text: escaping, line folding, events
│       │   ├── index.ts                          # Public exports of @kavanu/core
│       │   ├── links.ts                          # Daily study links: Sefaria and URL templates, unsafe schemes rejected
│       │   ├── memory.ts                         # In-memory store, Drive and group-file doubles for tests
│       │   ├── model.ts                          # Zod schemas and types for every document; parseDoc, parseGroupDoc
│       │   ├── ports.ts                          # DrivePort and LocalStorePort interfaces
│       │   ├── reminders.ts                      # PlanReminders: the notifications wanted in the coming window
│       │   ├── repository.ts                     # Repository: the local replica, writes stamped with HLCs, dirty tracking
│       │   ├── schedule.ts                       # Schedule engine: which session falls on a date, period progress
│       │   └── sync.ts                           # SyncEngine: pull, merge and push documents with Drive
│       ├── test/                                 # Vitest: schedules, links, merge, multi-device sync and groups
│       │   ├── core.test.ts
│       │   ├── groups.test.ts
│       │   └── sync.test.ts
│       ├── package.json
│       └── tsconfig.json
├── .ai                                           # Ogen-ai submodule: shared AI-assistant rules, skills and agents
├── .ai-sync-state.json                           # Hashes of the files ai-sync generated, so re-runs don't clobber edits
├── .gitignore
├── .gitmodules
├── AGENTS.md                                     # Generated by ai-sync: coding rules for AI assistants
├── CLAUDE.md                                     # Generated by ai-sync: copy of AGENTS.md for Claude Code
├── LICENSE
├── README.md                                     # Az Kavanu · אז קבענו
├── ai-config.local.md                            # Project rules appended to AGENTS.md
├── ai-config.toml                                # Which ogen-ai rule fragments, tools and options ai-sync compiles
├── package-lock.json
├── package.json
└── vercel.json                                   # Vercel build settings for the repo root
```
<!-- END GENERATED TREE -->
