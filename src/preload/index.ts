import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { ConnectorAuthState, FilesAuthState, SearchResult, SyncStatus } from '../shared/types'

const api = {
  search: (text: string): Promise<SearchResult[]> => ipcRenderer.invoke(IPC.search, text),

  onSyncProgress: (cb: (status: SyncStatus) => void): (() => void) => {
    const listener = (_: unknown, status: SyncStatus): void => cb(status)
    ipcRenderer.on(IPC.syncStatus, listener)
    return () => ipcRenderer.removeListener(IPC.syncStatus, listener)
  },

  gmail: {
    status: (): Promise<ConnectorAuthState> => ipcRenderer.invoke(IPC.gmailAuthStatus),
    connect: (): Promise<ConnectorAuthState> => ipcRenderer.invoke(IPC.gmailAuthStart),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.gmailDisconnect),
    sync: (): Promise<{ indexed: number }> => ipcRenderer.invoke(IPC.gmailSync)
  },

  files: {
    status: (): Promise<FilesAuthState> => ipcRenderer.invoke(IPC.filesAuthStatus),
    connect: (): Promise<FilesAuthState> => ipcRenderer.invoke(IPC.filesAuthStart),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.filesDisconnect),
    sync: (): Promise<{ indexed: number }> => ipcRenderer.invoke(IPC.filesSync)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
