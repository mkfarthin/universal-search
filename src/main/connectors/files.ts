import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getDb, recordSync, upsertDocument } from '../db'
import type { SourceConnector } from './types'
import { isTextFile, walkFiles } from './files-walk'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES_PER_SYNC = 20000
const PROGRESS_EVERY = 25

class StopWalk extends Error {}

function foldersConfigPath(): string {
  return path.join(app.getPath('userData'), 'files-folders.json')
}

export function listFolders(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(foldersConfigPath(), 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveFolders(folders: string[]): void {
  fs.writeFileSync(foldersConfigPath(), JSON.stringify(folders, null, 2))
}

export const filesConnector: SourceConnector = {
  id: 'files',

  isConnected(): boolean {
    return listFolders().length > 0
  },

  async connect(): Promise<void> {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return

    const chosen = result.filePaths[0]
    const folders = listFolders()
    if (!folders.includes(chosen)) {
      folders.push(chosen)
      saveFolders(folders)
    }
  },

  disconnect(): void {
    saveFolders([])
  },

  async sync(onProgress): Promise<{ indexed: number }> {
    const folders = listFolders()
    const db = getDb()
    let indexed = 0

    try {
      for (const folder of folders) {
        await walkFiles(folder, async (file) => {
          let body = ''
          if (isTextFile(file.path) && file.size <= MAX_FILE_BYTES) {
            try {
              body = await fs.promises.readFile(file.path, 'utf-8')
            } catch {
              body = ''
            }
          }

          upsertDocument(db, {
            id: `files:${file.path}`,
            source: 'files',
            title: path.basename(file.path),
            sender: path.dirname(file.path),
            timestamp: file.mtimeMs,
            link: pathToFileURL(file.path).href,
            body
          })

          indexed += 1
          if (indexed % PROGRESS_EVERY === 0) onProgress?.(indexed)
          if (indexed >= MAX_FILES_PER_SYNC) throw new StopWalk()
        })
      }
    } catch (err) {
      if (!(err instanceof StopWalk)) throw err
    }

    onProgress?.(indexed)
    recordSync(db, 'files')
    return { indexed }
  }
}
