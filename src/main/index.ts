import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../shared/ipc'
import type { SyncStatus } from '../shared/types'
import { getDb, searchDocuments } from './db'
import { gmailConnector } from './connectors/gmail'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function sendSyncStatus(status: SyncStatus): void {
  mainWindow?.webContents.send(IPC.gmailSyncStatus, status)
}

app.whenReady().then(() => {
  getDb() // initialize the local index eagerly so search is ready immediately

  ipcMain.handle(IPC.search, (_e, text: string) => searchDocuments(getDb(), text))

  ipcMain.handle(IPC.gmailAuthStatus, () => ({ connected: gmailConnector.isConnected() }))

  ipcMain.handle(IPC.gmailAuthStart, async () => {
    sendSyncStatus({ source: 'gmail', state: 'authenticating' })
    try {
      await gmailConnector.connect()
      sendSyncStatus({ source: 'gmail', state: 'idle' })
      return { connected: true }
    } catch (err) {
      sendSyncStatus({ source: 'gmail', state: 'error', message: (err as Error).message })
      throw err
    }
  })

  ipcMain.handle(IPC.gmailDisconnect, () => {
    gmailConnector.disconnect()
  })

  ipcMain.handle(IPC.gmailSync, async () => {
    sendSyncStatus({ source: 'gmail', state: 'syncing', indexed: 0 })
    try {
      const result = await gmailConnector.sync((indexed) =>
        sendSyncStatus({ source: 'gmail', state: 'syncing', indexed })
      )
      sendSyncStatus({ source: 'gmail', state: 'done', indexed: result.indexed })
      return result
    } catch (err) {
      sendSyncStatus({ source: 'gmail', state: 'error', message: (err as Error).message })
      throw err
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
