# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A local-first desktop app (Electron + React + TypeScript) that indexes personal
data sources — Gmail and local files so far — into a single local full-text
search index, so the user can search across all of them from one box.
Everything is local-only: no backend, no cloud sync. See README.md for Gmail
OAuth setup and how folder indexing works.

## Commands

- `npm run dev` — run the app with hot reload (electron-vite)
- `npm test` — run the vitest suite (`test/*.test.ts`); a single file: `npx vitest run test/db.test.ts`
- `npm run typecheck` — TypeScript, no emit (checks both the renderer and main/preload tsconfigs)
- `npm run lint` — ESLint (flat config, `eslint.config.js`)
- `npm run build` — production build via electron-vite
- `npm run package` — build + package a distributable via electron-builder

After `npm install`, `better-sqlite3` is native and prebuilt against
Electron's Node-API — this happens automatically via the `postinstall`
script (`electron-rebuild`). It also works unmodified under plain Node
(e.g. for `npm test`), since better-sqlite3 v12+ uses N-API, which is
ABI-stable across Node and Electron — no separate rebuild step needed
between running tests and running the app.

If `npm run dev` fails with `Error: Electron uninstall`, the `electron`
package's binary download didn't run; fix with `node node_modules/electron/install.js`.

## Architecture

**Process split (standard Electron):** `src/main` (Node-side, full system
access), `src/preload` (the only bridge the renderer can use, via
`contextBridge`), `src/renderer` (React UI, sandboxed, no Node access). The
three communicate over the IPC channels named in `src/shared/ipc.ts`; the
payload shapes are in `src/shared/types.ts`. When adding a new IPC call, it
touches all three: a handler in `src/main/index.ts`, an exposed method in
`src/preload/index.ts`, and the type in `src/shared/types.ts`.

**Search index (`src/main/db/`):** a single SQLite database (Electron
`userData` dir) with a `documents` table and a linked `documents_fts` FTS5
virtual table, kept in sync via triggers (`schema.ts`). `schema.ts` is pure
(no Electron import) and takes a `Database.Database` instance as a
parameter — this is what makes it unit-testable under plain Node/vitest
(see `test/db.test.ts`) without spinning up Electron. `db/index.ts` is the
thin Electron-specific wrapper that owns the singleton connection at the
real on-disk path.

Query safety: `sanitizeMatchQuery` quotes every token before it reaches
FTS5's MATCH syntax, so raw user input can never be interpreted as FTS5
query operators. Match highlighting uses a pair of non-printable marker
characters (`SNIPPET_MATCH_START`/`END` in `schema.ts`, not HTML tags) as
snippet delimiters, specifically so the renderer never needs
`dangerouslySetInnerHTML` on untrusted document content (an indexed email
body, a file's contents) — see `renderSnippet` in `App.tsx`.

**Source connectors (`src/main/connectors/`):** every data source
implements the `SourceConnector` interface (`connect`/`disconnect`/`sync`/
`isConnected`) in `types.ts`, and all connectors broadcast progress on the
single shared `IPC.syncStatus` channel (payload carries `source` so the
renderer can tell them apart) rather than each getting its own channel.
Adding a new source means adding a connector here and wiring it into
`src/main/index.ts` the same way Gmail/Files are — the DB layer and
renderer don't need to know the source exists ahead of time beyond a
`source` string on each document.

- `gmail.ts`: loopback-redirect OAuth (a local HTTP server catches
  Google's redirect — the standard flow for installed/desktop apps),
  encrypted token storage via `safeStorage`, and a `sync()` that walks the
  Gmail API. Proactively throttles requests (`throttled()`, ~5/sec) rather
  than only reacting to quota errors after the fact — reactive
  backoff-on-429 alone re-trips the same per-minute quota as soon as the
  backoff window passes, since it doesn't change the sustained request
  rate. `withRetry()` remains as a fallback for whatever still slips
  through.
- `files.ts` + `files-walk.ts`: `connect()` opens a native folder picker
  (`dialog.showOpenDialog`) and appends to a persisted folder list
  (`files-folders.json` in `userData`); `sync()` walks those folders, and
  `removeFolder()` both drops a folder from that list and deletes every
  document already indexed under it (`deleteDocumentsByIdPrefix` in
  `db/schema.ts`, matched by exact string prefix rather than SQL `LIKE` so
  a path containing `%`/`_` can't be misread as a wildcard). The walk
  itself (`files-walk.ts`) is pure/Electron-free — same testable-core
  split as `db/schema.ts` — and unconditionally skips dot-directories
  (so pointing it at a home directory never surfaces `.ssh`/`.aws`/etc.)
  and common build/dependency noise. Content is read for a fixed set of
  text-like extensions under a size cap; other files are still indexed by
  filename only.

**WhatsApp-specific constraint:** there's no official API for a personal
WhatsApp account, so that connector doesn't exist yet — see the "Known
limitations" section in README.md before starting on it.
