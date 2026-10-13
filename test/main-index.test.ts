import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../src/shared/ipc'

/**
 * main/index.ts talks to Electron and the connectors directly at module
 * scope (it registers IPC handlers inside `app.whenReady().then(...)`), so
 * testing it means mocking Electron's module surface and capturing the
 * handlers ipcMain.handle() was called with, then invoking them directly
 * and asserting on the mocked connectors/webContents.send — rather than
 * spinning up a real Electron process.
 */
const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = []
    webContents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
      send: vi.fn()
    }
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    constructor() {
      BrowserWindowMock.instances.push(this)
    }
    static getAllWindows(): BrowserWindowMock[] {
      return BrowserWindowMock.instances
    }
  }

  return {
    handlers,
    BrowserWindowMock,
    app: {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      getPath: vi.fn(() => '/tmp/mock-userdata'),
      quit: vi.fn()
    },
    shell: { openExternal: vi.fn() },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      })
    },
    getDb: vi.fn(() => ({})),
    searchDocuments: vi.fn(),
    gmailConnector: {
      isConnected: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      sync: vi.fn()
    },
    filesConnector: {
      isConnected: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      sync: vi.fn()
    },
    listFolders: vi.fn(() => [] as string[]),
    removeFolder: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  shell: mocks.shell,
  ipcMain: mocks.ipcMain,
  BrowserWindow: mocks.BrowserWindowMock
}))

vi.mock('../src/main/db', () => ({
  getDb: mocks.getDb,
  searchDocuments: mocks.searchDocuments
}))

vi.mock('../src/main/connectors/gmail', () => ({
  gmailConnector: mocks.gmailConnector
}))

vi.mock('../src/main/connectors/files', () => ({
  filesConnector: mocks.filesConnector,
  listFolders: mocks.listFolders,
  removeFolder: mocks.removeFolder
}))

function handler(channel: string): (event: unknown, ...args: unknown[]) => unknown {
  const h = mocks.handlers.get(channel)
  if (!h) throw new Error(`No handler registered for ${channel}`)
  return h
}

function statusMessages(): unknown[] {
  const win = mocks.BrowserWindowMock.instances[0]
  return win.webContents.send.mock.calls.filter((c) => c[0] === IPC.syncStatus).map((c) => c[1])
}

beforeAll(async () => {
  await import('../src/main/index')
  // app.whenReady().then(...) runs the registration as a microtask
  await new Promise((resolve) => setTimeout(resolve, 0))
})

beforeEach(() => {
  mocks.ipcMain.handle.mockClear()
  mocks.getDb.mockClear()
  mocks.searchDocuments.mockReset()
  mocks.gmailConnector.isConnected.mockReset()
  mocks.gmailConnector.connect.mockReset()
  mocks.gmailConnector.disconnect.mockReset()
  mocks.gmailConnector.sync.mockReset()
  mocks.filesConnector.isConnected.mockReset()
  mocks.filesConnector.connect.mockReset()
  mocks.filesConnector.disconnect.mockReset()
  mocks.filesConnector.sync.mockReset()
  mocks.listFolders.mockReset().mockReturnValue([])
  mocks.removeFolder.mockReset()
  mocks.BrowserWindowMock.instances[0]?.webContents.send.mockClear()
})

describe('search', () => {
  it('delegates to searchDocuments with the query text', async () => {
    mocks.searchDocuments.mockReturnValue([{ id: 'gmail:1' }])
    const result = await handler(IPC.search)({}, 'invoice')
    expect(mocks.searchDocuments).toHaveBeenCalledWith(mocks.getDb(), 'invoice')
    expect(result).toEqual([{ id: 'gmail:1' }])
  })
})

describe('gmail handlers', () => {
  it('auth-status reflects gmailConnector.isConnected()', async () => {
    mocks.gmailConnector.isConnected.mockReturnValue(true)
    expect(await handler(IPC.gmailAuthStatus)({})).toEqual({ connected: true })
  })

  it('auth-start: on success, broadcasts authenticating then idle and returns connected', async () => {
    mocks.gmailConnector.connect.mockResolvedValue(undefined)
    const result = await handler(IPC.gmailAuthStart)({})
    expect(result).toEqual({ connected: true })
    expect(statusMessages()).toEqual([
      { source: 'gmail', state: 'authenticating' },
      { source: 'gmail', state: 'idle' }
    ])
  })

  it('auth-start: on failure, broadcasts an error status and rethrows', async () => {
    mocks.gmailConnector.connect.mockRejectedValue(new Error('no credentials.json'))
    await expect(handler(IPC.gmailAuthStart)({})).rejects.toThrow('no credentials.json')
    expect(statusMessages()).toEqual([
      { source: 'gmail', state: 'authenticating' },
      { source: 'gmail', state: 'error', message: 'no credentials.json' }
    ])
  })

  it('disconnect delegates to gmailConnector.disconnect()', async () => {
    await handler(IPC.gmailDisconnect)({})
    expect(mocks.gmailConnector.disconnect).toHaveBeenCalledTimes(1)
  })

  it('sync: on success, broadcasts syncing progress then done, and returns the result', async () => {
    mocks.gmailConnector.sync.mockImplementation(async (onProgress?: (n: number) => void) => {
      onProgress?.(10)
      onProgress?.(25)
      return { indexed: 25 }
    })

    const result = await handler(IPC.gmailSync)({})

    expect(result).toEqual({ indexed: 25 })
    expect(statusMessages()).toEqual([
      { source: 'gmail', state: 'syncing', indexed: 0 },
      { source: 'gmail', state: 'syncing', indexed: 10 },
      { source: 'gmail', state: 'syncing', indexed: 25 },
      { source: 'gmail', state: 'done', indexed: 25 }
    ])
  })

  it('sync: on failure, broadcasts an error status and rethrows (no done message)', async () => {
    mocks.gmailConnector.sync.mockRejectedValue(new Error('quota exceeded'))

    await expect(handler(IPC.gmailSync)({})).rejects.toThrow('quota exceeded')

    expect(statusMessages()).toEqual([
      { source: 'gmail', state: 'syncing', indexed: 0 },
      { source: 'gmail', state: 'error', message: 'quota exceeded' }
    ])
  })
})

describe('files handlers', () => {
  it('auth-status reflects filesConnector.isConnected() and listFolders()', async () => {
    mocks.filesConnector.isConnected.mockReturnValue(true)
    mocks.listFolders.mockReturnValue(['/Users/x/Documents'])
    expect(await handler(IPC.filesAuthStatus)({})).toEqual({
      connected: true,
      folders: ['/Users/x/Documents']
    })
  })

  it('auth-start (Add Folder): returns the post-connect status with no status broadcast on success', async () => {
    mocks.filesConnector.connect.mockResolvedValue(undefined)
    mocks.filesConnector.isConnected.mockReturnValue(true)
    mocks.listFolders.mockReturnValue(['/Users/x/Documents'])

    const result = await handler(IPC.filesAuthStart)({})

    expect(result).toEqual({ connected: true, folders: ['/Users/x/Documents'] })
    expect(statusMessages()).toEqual([])
  })

  it('auth-start: on failure, broadcasts an error status and rethrows', async () => {
    mocks.filesConnector.connect.mockRejectedValue(new Error('dialog failed'))
    await expect(handler(IPC.filesAuthStart)({})).rejects.toThrow('dialog failed')
    expect(statusMessages()).toEqual([{ source: 'files', state: 'error', message: 'dialog failed' }])
  })

  it('remove-folder delegates to removeFolder(folder) and returns fresh status', async () => {
    mocks.filesConnector.isConnected.mockReturnValue(false)
    mocks.listFolders.mockReturnValue([])

    const result = await handler(IPC.filesRemoveFolder)({}, '/Users/x/Documents')

    expect(mocks.removeFolder).toHaveBeenCalledWith('/Users/x/Documents')
    expect(result).toEqual({ connected: false, folders: [] })
  })

  it('sync: on success, broadcasts syncing progress then done, and returns the result', async () => {
    mocks.filesConnector.sync.mockImplementation(async (onProgress?: (n: number) => void) => {
      onProgress?.(2)
      return { indexed: 2 }
    })

    const result = await handler(IPC.filesSync)({})

    expect(result).toEqual({ indexed: 2 })
    expect(statusMessages()).toEqual([
      { source: 'files', state: 'syncing', indexed: 0 },
      { source: 'files', state: 'syncing', indexed: 2 },
      { source: 'files', state: 'done', indexed: 2 }
    ])
  })

  it('sync: on failure, broadcasts an error status and rethrows', async () => {
    mocks.filesConnector.sync.mockRejectedValue(new Error('permission denied'))

    await expect(handler(IPC.filesSync)({})).rejects.toThrow('permission denied')

    expect(statusMessages()).toEqual([
      { source: 'files', state: 'syncing', indexed: 0 },
      { source: 'files', state: 'error', message: 'permission denied' }
    ])
  })
})
