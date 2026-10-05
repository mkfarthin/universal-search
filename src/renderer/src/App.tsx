import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ConnectorAuthState, FilesAuthState, SearchResult, SyncStatus } from '../../shared/types'

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

/**
 * Snippets from the index use / to mark matched terms (see
 * db/schema.ts) instead of raw HTML tags, so untrusted document content
 * (e.g. an email body) can never inject markup here.
 */
function renderSnippet(snippet: string): ReactNode {
  return snippet
    .split(/[]/)
    .map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>))
}

function statusLabel(status: SyncStatus | null, label: string): string | null {
  if (!status) return null
  switch (status.state) {
    case 'authenticating':
      return `Waiting for ${label} authorization…`
    case 'syncing':
      return `Syncing ${label}… ${status.indexed ?? 0} indexed`
    case 'done':
      return `${label} sync complete — ${status.indexed ?? 0} indexed`
    case 'error':
      return `${label} error: ${status.message}`
    default:
      return null
  }
}

export default function App(): ReactNode {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [gmail, setGmail] = useState<ConnectorAuthState>({ connected: false })
  const [files, setFiles] = useState<FilesAuthState>({ connected: false, folders: [] })
  const [gmailStatus, setGmailStatus] = useState<SyncStatus | null>(null)
  const [filesStatus, setFilesStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    window.api.gmail.status().then(setGmail)
    window.api.files.status().then(setFiles)

    return window.api.onSyncProgress((s) => {
      if (s.source === 'gmail') {
        setGmailStatus(s)
        if (s.state === 'done' || s.state === 'idle') window.api.gmail.status().then(setGmail)
      } else if (s.source === 'files') {
        setFilesStatus(s)
        if (s.state === 'done' || s.state === 'idle') window.api.files.status().then(setFiles)
      }
    })
  }, [])

  useEffect(() => {
    const text = query.trim()
    if (!text) return
    const timer = setTimeout(() => {
      window.api.search(text).then(setResults)
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  const visibleResults = query.trim() ? results : []

  const gmailLabel = useMemo(() => statusLabel(gmailStatus, 'Gmail'), [gmailStatus])
  const filesLabel = useMemo(() => statusLabel(filesStatus, 'Files'), [filesStatus])

  return (
    <div className="app">
      <header className="toolbar">
        <input
          autoFocus
          className="search-input"
          placeholder="Search everything…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="source-controls">
          {gmail.connected ? (
            <button onClick={() => window.api.gmail.sync()}>Sync Gmail</button>
          ) : (
            <button onClick={() => window.api.gmail.connect().then(setGmail)}>Connect Gmail</button>
          )}
          <button onClick={() => window.api.files.connect().then(setFiles)}>Add Folder…</button>
          {files.connected && <button onClick={() => window.api.files.sync()}>Sync Files</button>}
        </div>
      </header>

      {files.connected && (
        <div className="folders-bar">
          Indexing {files.folders.length} folder{files.folders.length === 1 ? '' : 's'}:{' '}
          {files.folders.join(', ')}
        </div>
      )}

      {gmailLabel && <div className="status-bar">{gmailLabel}</div>}
      {filesLabel && <div className="status-bar">{filesLabel}</div>}

      <ul className="results">
        {visibleResults.map((r) => (
          <li key={r.id} className="result">
            <a className="result-title" href={r.link ?? undefined} target="_blank" rel="noreferrer">
              {r.title}
            </a>
            <div className="result-meta">
              {r.source} · {r.sender ?? (r.source === 'files' ? 'local file' : 'unknown sender')} ·{' '}
              {formatDate(r.timestamp)}
            </div>
            <div className="result-snippet">{renderSnippet(r.snippet)}</div>
          </li>
        ))}
        {query.trim() && visibleResults.length === 0 && <li className="empty">No results</li>}
      </ul>
    </div>
  )
}
