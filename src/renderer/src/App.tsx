import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FilesAuthState, GmailAuthState, SearchResult, SearchSort, SyncStatus } from '../../shared/types'

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
  const [sort, setSort] = useState<SearchSort>('relevance')
  const [results, setResults] = useState<SearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [gmail, setGmail] = useState<GmailAuthState>({ connected: false, includeSpamTrash: false })
  const [files, setFiles] = useState<FilesAuthState>({ connected: false, folders: [] })
  const [gmailStatus, setGmailStatus] = useState<SyncStatus | null>(null)
  const [filesStatus, setFilesStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    window.api.gmail.status().then(setGmail)
    window.api.files.status().then(setFiles)

    return window.api.onSyncProgress((s) => {
      if (s.source === 'gmail') {
        setGmailStatus(s)
        // Also re-check on 'error': a sync failure can itself change
        // connection state (e.g. a dead token gets cleared), and the
        // button (Connect vs Sync) needs to reflect that immediately.
        if (s.state === 'done' || s.state === 'idle' || s.state === 'error') {
          window.api.gmail.status().then(setGmail)
        }
      } else if (s.source === 'files') {
        setFilesStatus(s)
        if (s.state === 'done' || s.state === 'idle' || s.state === 'error') {
          window.api.files.status().then(setFiles)
        }
      }
    })
  }, [])

  useEffect(() => {
    const text = query.trim()
    if (!text) return
    const timer = setTimeout(() => {
      window.api.search(text, sort).then(({ results, total }) => {
        setResults(results)
        setTotal(total)
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [query, sort])

  const visibleResults = query.trim() ? results : []
  const visibleTotal = query.trim() ? total : 0

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
        <select
          className="sort-select"
          aria-label="Sort results by"
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchSort)}
        >
          <option value="relevance">Relevance</option>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
        </select>
        <div className="source-controls">
          {gmail.connected ? (
            <button onClick={() => window.api.gmail.sync()}>Sync Gmail</button>
          ) : (
            <button onClick={() => window.api.gmail.connect().then(setGmail)}>Connect Gmail</button>
          )}
          <label className="spam-trash-toggle" title="Takes effect on the next Sync Gmail">
            <input
              type="checkbox"
              checked={gmail.includeSpamTrash}
              onChange={(e) => window.api.gmail.setIncludeSpamTrash(e.target.checked).then(setGmail)}
            />
            Include Spam/Trash
          </label>
          <button onClick={() => window.api.files.connect().then(setFiles)}>Add Folder…</button>
          {files.connected && <button onClick={() => window.api.files.sync()}>Sync Files</button>}
        </div>
      </header>

      {files.connected && (
        <ul className="folders-bar">
          {files.folders.map((folder) => (
            <li key={folder} className="folder-chip">
              <span className="folder-chip-path">{folder}</span>
              <button
                className="folder-chip-remove"
                title={`Stop indexing ${folder}`}
                onClick={() => window.api.files.removeFolder(folder).then(setFiles)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {gmailLabel && <div className="status-bar">{gmailLabel}</div>}
      {filesLabel && <div className="status-bar">{filesLabel}</div>}

      {query.trim() && (
        <div className="results-count">
          {visibleTotal} result{visibleTotal === 1 ? '' : 's'}
        </div>
      )}

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
