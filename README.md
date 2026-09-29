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

## Development

- `npm run dev` — start the app with hot reload
- `npm test` — run the test suite (vitest)
- `npm run typecheck` — TypeScript, no emit
- `npm run lint` — ESLint
- `npm run build` — production build
- `npm run package` — build and package a distributable via electron-builder

## Known limitation: WhatsApp

WhatsApp has no official API for personal accounts, so it isn't wired up
yet. The two realistic paths, when we get to it, are: (a) parsing manually
exported chat `.txt` files, or (b) automating WhatsApp Web (unofficial,
against WhatsApp's ToS, fragile). Exported-chat parsing is the safer bet.
