import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { GmailAuthState, SearchResult, SyncStatus } from '../../shared/types'

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

export default function App(): ReactNode {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [gmail, setGmail] = useState<GmailAuthState>({ connected: false })
  const [status, setStatus] = useState<SyncStatus | null>(null)

  useEffect(() => {
    window.api.gmail.status().then(setGmail)
    return window.api.gmail.onSyncProgress((s) => {
      setStatus(s)
      if (s.state === 'done' || s.state === 'idle') {
        window.api.gmail.status().then(setGmail)
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

  const statusLabel = useMemo(() => {
    if (!status) return null
    switch (status.state) {
      case 'authenticating':
        return 'Waiting for Google sign-in in your browser…'
      case 'syncing':
        return `Syncing Gmail… ${status.indexed ?? 0} indexed`
      case 'done':
        return `Gmail sync complete — ${status.indexed ?? 0} messages indexed`
      case 'error':
        return `Error: ${status.message}`
      default:
        return null
    }
  }, [status])

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
        </div>
      </header>

      {statusLabel && <div className="status-bar">{statusLabel}</div>}

      <ul className="results">
        {visibleResults.map((r) => (
          <li key={r.id} className="result">
            <a className="result-title" href={r.link ?? undefined} target="_blank" rel="noreferrer">
              {r.title}
            </a>
            <div className="result-meta">
              {r.source} · {r.sender ?? 'unknown sender'} · {formatDate(r.timestamp)}
            </div>
            <div className="result-snippet">{renderSnippet(r.snippet)}</div>
          </li>
        ))}
        {query.trim() && visibleResults.length === 0 && <li className="empty">No results</li>}
      </ul>
    </div>
  )
}
