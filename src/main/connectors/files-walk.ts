import fs from 'node:fs'
import path from 'node:path'

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
  '.xml',
  '.sh',
  '.rb',
  '.go',
  '.rs',
  '.php',
  '.sql'
])

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.cache'
])

/** Dot-directories are skipped unconditionally — a folder like a home
 * directory must never surface things like .ssh, .aws or .gnupg just
 * because the user picked a broad root to index. */
export function isHiddenOrSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIR_NAMES.has(name)
}

export function isTextFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export interface WalkedFile {
  path: string
  size: number
  mtimeMs: number
}

/**
 * Recursively walks a directory tree, skipping symlinks (avoids cycles and
 * escaping the chosen tree) and hidden/noise directories. `onFile` may
 * throw to abort the walk early (propagates out of every pending await).
 */
export async function walkFiles(
  rootDir: string,
  onFile: (file: WalkedFile) => Promise<void> | void
): Promise<void> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(rootDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = path.join(rootDir, entry.name)

    if (entry.isDirectory()) {
      if (isHiddenOrSkippedDir(entry.name)) continue
      await walkFiles(full, onFile)
    } else if (entry.isFile()) {
      if (entry.name.startsWith('.')) continue
      let stat: fs.Stats
      try {
        stat = await fs.promises.stat(full)
      } catch {
        continue
      }
      await onFile({ path: full, size: stat.size, mtimeMs: stat.mtimeMs })
    }
  }
}
