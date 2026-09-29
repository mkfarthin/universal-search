import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { initSchema, sanitizeMatchQuery, searchDocuments, upsertDocument } from '../src/main/db/schema'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  initSchema(db)
  return db
}

describe('sanitizeMatchQuery', () => {
  it('wraps tokens as quoted prefix terms joined by AND', () => {
    expect(sanitizeMatchQuery('hello world')).toBe('"hello"* AND "world"*')
  })

  it('escapes embedded quotes', () => {
    expect(sanitizeMatchQuery('foo"bar')).toBe('"foo""bar"*')
  })

  it('treats FTS5 operators in the input as literal text, not syntax', () => {
    expect(sanitizeMatchQuery('foo OR bar')).toBe('"foo"* AND "OR"* AND "bar"*')
  })

  it('handles empty input', () => {
    expect(sanitizeMatchQuery('   ')).toBe('""')
  })
})

describe('search index', () => {
  it('finds documents by prefix match across title and body', () => {
    const db = makeDb()
    upsertDocument(db, {
      id: 'gmail:1',
      source: 'gmail',
      title: 'Invoice from Acme',
      sender: 'billing@acme.com',
      timestamp: Date.now(),
      link: null,
      body: 'Please find attached your invoice for September.'
    })

    const results = searchDocuments(db, 'invoi')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('gmail:1')
  })

  it('returns no results for non-matching queries', () => {
    const db = makeDb()
    upsertDocument(db, {
      id: 'gmail:1',
      source: 'gmail',
      title: 'Invoice',
      sender: null,
      timestamp: Date.now(),
      link: null,
      body: 'invoice body'
    })

    expect(searchDocuments(db, 'zzznotfound')).toHaveLength(0)
  })

  it('updates existing documents in place on upsert, without duplicating', () => {
    const db = makeDb()
    const base = { id: 'gmail:1', source: 'gmail', sender: null, timestamp: 1, link: null }

    upsertDocument(db, { ...base, title: 'Old title', body: 'old body' })
    upsertDocument(db, { ...base, title: 'New title', body: 'new body' })

    const results = searchDocuments(db, 'new')
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('New title')
    expect(searchDocuments(db, 'old')).toHaveLength(0)
  })

  it('marks matched terms with the snippet delimiters', () => {
    const db = makeDb()
    upsertDocument(db, {
      id: 'gmail:1',
      source: 'gmail',
      title: 'Quarterly Report',
      sender: null,
      timestamp: Date.now(),
      link: null,
      body: 'The quarterly numbers are attached.'
    })

    const [result] = searchDocuments(db, 'quarterly')
    expect(result.snippet).toContain('')
    expect(result.snippet).toContain('')
  })
})
