import type Database from 'better-sqlite3'

/** Delimits matched terms in snippets. Chosen to be invalid HTML so the
 * renderer can safely split on them without escaping concerns. */
export const SNIPPET_MATCH_START = ''
export const SNIPPET_MATCH_END = ''

export function initSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      sender TEXT,
      timestamp INTEGER NOT NULL,
      link TEXT,
      body TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title, sender, body,
      content='documents',
      content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, title, sender, body)
      VALUES (new.rowid, new.title, new.sender, new.body);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, sender, body)
      VALUES ('delete', old.rowid, old.title, old.sender, old.body);
    END;

    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, title, sender, body)
      VALUES ('delete', old.rowid, old.title, old.sender, old.body);
      INSERT INTO documents_fts(rowid, title, sender, body)
      VALUES (new.rowid, new.title, new.sender, new.body);
    END;

    CREATE TABLE IF NOT EXISTS sync_state (
      source TEXT PRIMARY KEY,
      last_synced_at INTEGER
    );
  `)
}

export interface UpsertDoc {
  id: string
  source: string
  title: string
  sender: string | null
  timestamp: number
  link: string | null
  body: string
}

export function upsertDocument(db: Database.Database, doc: UpsertDoc): void {
  db.prepare(
    `
    INSERT INTO documents (id, source, title, sender, timestamp, link, body)
    VALUES (@id, @source, @title, @sender, @timestamp, @link, @body)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      sender = excluded.sender,
      timestamp = excluded.timestamp,
      link = excluded.link,
      body = excluded.body
    `
  ).run(doc)
}

/**
 * FTS5 treats quotes, hyphens, asterisks etc. as query syntax. User search
 * input is untrusted, so every token is quoted into a literal phrase (with
 * a trailing `*` for prefix matching) and joined with AND — this prevents
 * FTS5 syntax errors/injection from arbitrary input like `foo OR "bar`.
 */
export function sanitizeMatchQuery(input: string): string {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return '""'
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' AND ')
}

export interface SearchRow {
  id: string
  source: string
  title: string
  sender: string | null
  timestamp: number
  link: string | null
  snippet: string
}

export function searchDocuments(db: Database.Database, text: string, limit = 50): SearchRow[] {
  const stmt = db.prepare(`
    SELECT d.id, d.source, d.title, d.sender, d.timestamp, d.link,
           snippet(documents_fts, 2, ?, ?, '…', 12) AS snippet
    FROM documents_fts
    JOIN documents d ON d.rowid = documents_fts.rowid
    WHERE documents_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `)
  return stmt.all(SNIPPET_MATCH_START, SNIPPET_MATCH_END, sanitizeMatchQuery(text), limit) as SearchRow[]
}

export function recordSync(db: Database.Database, source: string): void {
  db.prepare(
    `
    INSERT INTO sync_state (source, last_synced_at) VALUES (?, ?)
    ON CONFLICT(source) DO UPDATE SET last_synced_at = excluded.last_synced_at
    `
  ).run(source, Date.now())
}
