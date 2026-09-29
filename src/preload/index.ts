import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { GmailAuthState, SearchResult, SyncStatus } from '../shared/types'

const api = {
  search: (text: string): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.search, text),
  gmail: {
    status: (): Promise<GmailAuthState> => ipcRenderer.invoke(IPC.gmailAuthStatus),
    connect: (): Promise<GmailAuthState> => ipcRenderer.invoke(IPC.gmailAuthStart),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.gmailDisconnect),
    sync: (): Promise<{ indexed: number }> => ipcRenderer.invoke(IPC.gmailSync),
    onSyncProgress: (cb: (status: SyncStatus) => void): (() => void) => {
      const listener = (_: unknown, status: SyncStatus): void => cb(status)
      ipcRenderer.on(IPC.gmailSyncStatus, listener)
      return () => ipcRenderer.removeListener(IPC.gmailSyncStatus, listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
