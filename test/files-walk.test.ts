import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isHiddenOrSkippedDir, isTextFile, walkFiles } from '../src/main/connectors/files-walk'

describe('isTextFile', () => {
  it('recognizes common text extensions', () => {
    expect(isTextFile('notes.md')).toBe(true)
    expect(isTextFile('src/App.tsx')).toBe(true)
    expect(isTextFile('data.CSV')).toBe(true)
  })

  it('rejects unrecognized/binary extensions', () => {
    expect(isTextFile('photo.jpg')).toBe(false)
    expect(isTextFile('archive.zip')).toBe(false)
    expect(isTextFile('no-extension')).toBe(false)
  })
})

describe('isHiddenOrSkippedDir', () => {
  it('flags dot-directories so sensitive folders are never walked into', () => {
    expect(isHiddenOrSkippedDir('.ssh')).toBe(true)
    expect(isHiddenOrSkippedDir('.aws')).toBe(true)
    expect(isHiddenOrSkippedDir('.git')).toBe(true)
  })

  it('flags known noise directories', () => {
    expect(isHiddenOrSkippedDir('node_modules')).toBe(true)
    expect(isHiddenOrSkippedDir('dist')).toBe(true)
  })

  it('allows ordinary directories', () => {
    expect(isHiddenOrSkippedDir('Documents')).toBe(false)
    expect(isHiddenOrSkippedDir('src')).toBe(false)
  })
})

describe('walkFiles', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'files-walk-test-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('finds files in nested directories', async () => {
    fs.mkdirSync(path.join(root, 'sub'))
    fs.writeFileSync(path.join(root, 'top.txt'), 'top')
    fs.writeFileSync(path.join(root, 'sub', 'nested.txt'), 'nested')

    const found: string[] = []
    await walkFiles(root, (file) => {
      found.push(path.relative(root, file.path))
    })

    expect(found.sort()).toEqual(['sub/nested.txt', 'top.txt'])
  })

  it('never walks into a dot-directory like .ssh', async () => {
    fs.mkdirSync(path.join(root, '.ssh'))
    fs.writeFileSync(path.join(root, '.ssh', 'id_rsa'), 'secret')
    fs.writeFileSync(path.join(root, 'visible.txt'), 'visible')

    const found: string[] = []
    await walkFiles(root, (file) => {
      found.push(path.relative(root, file.path))
    })

    expect(found).toEqual(['visible.txt'])
  })

  it('skips node_modules', async () => {
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg.js'), 'module.exports = {}')
    fs.writeFileSync(path.join(root, 'index.js'), 'console.log(1)')

    const found: string[] = []
    await walkFiles(root, (file) => {
      found.push(path.relative(root, file.path))
    })

    expect(found).toEqual(['index.js'])
  })

  it('propagates an error thrown from onFile to abort the walk early', async () => {
    fs.writeFileSync(path.join(root, 'a.txt'), 'a')
    fs.writeFileSync(path.join(root, 'b.txt'), 'b')

    class Stop extends Error {}
    let visited = 0

    await expect(
      walkFiles(root, () => {
        visited += 1
        throw new Stop()
      })
    ).rejects.toThrow(Stop)

    expect(visited).toBe(1)
  })
})
