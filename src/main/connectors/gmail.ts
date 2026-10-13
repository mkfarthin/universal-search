import { app, safeStorage, shell } from 'electron'
import { google } from 'googleapis'
import type { Credentials, OAuth2Client } from 'google-auth-library'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import { getDb, recordSync, upsertDocument } from '../db'
import { createThrottle, withRetry } from '../lib/rate-limit'
import { extractPlainText, findHeader } from './gmail-parse'
import type { SourceConnector } from './types'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
const MAX_MESSAGES_PER_SYNC = 2000
const AUTH_TIMEOUT_MS = 5 * 60 * 1000
const RETRY_OPTIONS = { maxRetries: 6, baseDelayMs: 1000, maxDelayMs: 32000 }
// Caps sustained throughput to ~5 requests/sec (~1500 quota units/min at 5
// units/call), comfortably under the Gmail API's per-minute-per-user quota.
// Backoff alone isn't enough: it only reacts after a burst already tripped
// the limit, then immediately re-bursts once the backoff window passes.
const MIN_REQUEST_INTERVAL_MS = 200

const throttle = createThrottle(MIN_REQUEST_INTERVAL_MS)

/** Spaces calls apart (see MIN_REQUEST_INTERVAL_MS above), then applies
 * withRetry as a safety net for any quota error that slips through anyway. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  return throttle(() => withRetry(fn, RETRY_OPTIONS))
}

function credentialsPath(): string {
  // Dev convenience: a credentials.json dropped in the project root is
  // picked up first; otherwise fall back to a copy in the app data dir
  // (useful for a packaged build). See README for how to obtain this file.
  const devPath = path.join(process.cwd(), 'credentials.json')
  if (fs.existsSync(devPath)) return devPath
  return path.join(app.getPath('userData'), 'gmail-credentials.json')
}

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'gmail-token.enc')
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'gmail-settings.json')
}

/** Off by default: Gmail's own messages.list excludes Spam/Trash unless
 * asked for, and a new install shouldn't silently start indexing those. */
export function getIncludeSpamTrash(): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'))
    return Boolean(parsed.includeSpamTrash)
  } catch {
    return false
  }
}

export function setIncludeSpamTrash(value: boolean): void {
  fs.writeFileSync(settingsPath(), JSON.stringify({ includeSpamTrash: value }, null, 2))
}

function loadClientCredentials(): { client_id: string; client_secret: string } {
  const file = credentialsPath()
  if (!fs.existsSync(file)) {
    throw new Error(
      'No Gmail OAuth client configured. Create a Desktop OAuth client in Google Cloud Console ' +
        'and save it as credentials.json in the project root (see README.md).'
    )
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const key = raw.installed ?? raw.web
  if (!key?.client_id || !key?.client_secret) {
    throw new Error('credentials.json is missing client_id/client_secret.')
  }
  return { client_id: key.client_id, client_secret: key.client_secret }
}

function saveToken(tokens: Credentials): void {
  const json = JSON.stringify(tokens)
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf-8')
  fs.writeFileSync(tokenPath(), data)
}

function loadToken(): Credentials | null {
  if (!fs.existsSync(tokenPath())) return null
  const buf = fs.readFileSync(tokenPath())
  const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf-8')
  return JSON.parse(json) as Credentials
}

/**
 * Installed-app OAuth via a loopback redirect: we open the system browser
 * for consent and capture the resulting code on a short-lived local server,
 * per Google's recommended flow for desktop apps (no client secret embedded
 * in a shipped binary is treated as truly secret either way).
 */
function runLoopbackAuth(clientId: string, clientSecret: string): Promise<Credentials> {
  return new Promise((resolve, reject) => {
    let settled = false

    const server = http.createServer((req, res) => {
      void (async () => {
        try {
          const url = new URL(req.url ?? '', 'http://127.0.0.1')
          const errorParam = url.searchParams.get('error')
          const code = url.searchParams.get('code')

          if (errorParam) {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end('<html><body>Authorization was cancelled. You can close this tab.</body></html>')
            throw new Error(`Google authorization error: ${errorParam}`)
          }
          if (!code) {
            res.writeHead(400).end('Missing authorization code')
            return
          }

          const port = (server.address() as AddressInfo).port
          const redirectUri = `http://127.0.0.1:${port}`
          const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
          const { tokens } = await client.getToken({ code, redirect_uri: redirectUri })

          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<html><body>Gmail connected — you can close this tab and return to the app.</body></html>')
          settled = true
          resolve(tokens)
        } catch (err) {
          settled = true
          reject(err instanceof Error ? err : new Error(String(err)))
        } finally {
          server.close()
        }
      })()
    })

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      const redirectUri = `http://127.0.0.1:${port}`
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
      const authUrl = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
      shell.openExternal(authUrl)
    })

    setTimeout(() => {
      if (!settled) {
        server.close()
        reject(new Error('Gmail authorization timed out.'))
      }
    }, AUTH_TIMEOUT_MS)
  })
}

async function getAuthorizedClient(): Promise<OAuth2Client> {
  const { client_id, client_secret } = loadClientCredentials()
  const client = new google.auth.OAuth2(client_id, client_secret)

  const existing = loadToken()
  if (existing) {
    client.setCredentials(existing)
    return client
  }

  const tokens = await runLoopbackAuth(client_id, client_secret)
  client.setCredentials(tokens)
  saveToken(tokens)
  return client
}

export const gmailConnector: SourceConnector = {
  id: 'gmail',

  isConnected(): boolean {
    return fs.existsSync(tokenPath())
  },

  async connect(): Promise<void> {
    await getAuthorizedClient()
  },

  disconnect(): void {
    if (fs.existsSync(tokenPath())) fs.unlinkSync(tokenPath())
  },

  async sync(onProgress): Promise<{ indexed: number }> {
    const auth = await getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const db = getDb()
    const includeSpamTrash = getIncludeSpamTrash()

    let indexed = 0
    let pageToken: string | undefined

    do {
      const list = await throttled(() =>
        gmail.users.messages.list({ userId: 'me', maxResults: 100, pageToken, includeSpamTrash })
      )
      const messages = list.data.messages ?? []

      for (const m of messages) {
        if (!m.id) continue
        const full = await throttled(() => gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' }))
        const headers = full.data.payload?.headers ?? []
        const subject = findHeader(headers, 'Subject') ?? '(no subject)'
        const from = findHeader(headers, 'From')
        const timestamp = full.data.internalDate ? Number(full.data.internalDate) : Date.now()
        const body = extractPlainText(full.data.payload) ?? full.data.snippet ?? ''

        upsertDocument(db, {
          id: `gmail:${m.id}`,
          source: 'gmail',
          title: subject,
          sender: from,
          timestamp,
          link: `https://mail.google.com/mail/u/0/#all/${m.id}`,
          body
        })
        indexed += 1
        onProgress?.(indexed)
      }

      pageToken = list.data.nextPageToken ?? undefined
    } while (pageToken && indexed < MAX_MESSAGES_PER_SYNC)

    recordSync(db, 'gmail')
    return { indexed }
  }
}
