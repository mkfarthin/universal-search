# Universal Search

A local desktop app that indexes your Gmail (and, over time, other personal
data sources) into a single searchable index. Everything is indexed and
stored **locally on your machine** — nothing is synced to a server.

## Setup

```bash
npm install
```

### Connect Gmail

Gmail access requires your own OAuth client (Google does not allow shipping
a shared client secret for personal Gmail data):

1. In the [Google Cloud Console](https://console.cloud.google.com/), create
   a project (or reuse one) and enable the **Gmail API**.
2. Under **APIs & Services → Credentials**, create an **OAuth client ID** of
   type **Desktop app**.
3. Download the resulting JSON and save it as `credentials.json` in the
   project root (this file is gitignored — never commit it).
4. Run the app (`npm run dev`) and click **Connect Gmail**. This opens your
   system browser for Google's consent screen, then hands control back to
   the app via a local loopback redirect.

Your Gmail OAuth token is encrypted at rest (via Electron's `safeStorage`)
and stored in the app's local data directory, alongside the SQLite search
index. Both are gitignored and never leave your machine.

By default, sync excludes Spam and Trash (matching Gmail's own API
default). Check **Include Spam/Trash** to pull those in too — it takes
effect on the next **Sync Gmail**, not retroactively.

### Index local files

Click **Add Folder…** and pick a directory in the native file picker — it's
indexed on the next **Sync Files**. Add it again to index more folders.
Click the **×** on a folder's chip to stop indexing it; this also removes
everything already indexed from inside it.

Content is extracted and indexed for common text file types (`.md`, `.txt`,
source code, `.json`, `.csv`, etc., up to 2MB each); other file types are
still searchable by filename. Dot-directories (`.ssh`, `.git`, `.aws`, …)
and common build/dependency noise (`node_modules`, `dist`, `build`, venvs)
are always skipped, even inside a broad folder like your home directory.

## Development

- `npm run dev` — start the app with hot reload
- `npm test` — run the test suite (vitest)
- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run package` — build and package a distributable via electron-builder

## Known limitations

### WhatsApp

WhatsApp has no official API for personal accounts, so it isn't wired up
yet. The two realistic paths, when we get to it, are: (a) parsing manually
exported chat `.txt` files, or (b) automating WhatsApp Web (unofficial,
against WhatsApp's ToS, fragile). Exported-chat parsing is the safer bet.
