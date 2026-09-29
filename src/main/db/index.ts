import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { initSchema } from './schema'

let db: Database.Database | null = null

/** The local index — one SQLite file per user, in Electron's per-app data dir. */
export function getDb(): Database.Database {
  if (db) return db
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, 'index.sqlite3'))
  initSchema(db)
  return db
}

export * from './schema'
