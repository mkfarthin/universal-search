import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { FilesAuthState, GmailAuthState, SearchResponse, SearchSort, SyncStatus } from '../shared/types'

const api = {
  search: (text: string, sort?: SearchSort): Promise<SearchResponse> => ipcRenderer.invoke(IPC.search, text, sort),

  onSyncProgress: (cb: (status: SyncStatus) => void): (() => void) => {
    const listener = (_: unknown, status: SyncStatus): void => cb(status)
    ipcRenderer.on(IPC.syncStatus, listener)
    return () => ipcRenderer.removeListener(IPC.syncStatus, listener)
  },

  gmail: {
    status: (): Promise<GmailAuthState> => ipcRenderer.invoke(IPC.gmailAuthStatus),
    connect: (): Promise<GmailAuthState> => ipcRenderer.invoke(IPC.gmailAuthStart),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.gmailDisconnect),
    sync: (): Promise<{ indexed: number }> => ipcRenderer.invoke(IPC.gmailSync),
    setIncludeSpamTrash: (value: boolean): Promise<GmailAuthState> =>
      ipcRenderer.invoke(IPC.gmailSetIncludeSpamTrash, value)
  },

  files: {
    status: (): Promise<FilesAuthState> => ipcRenderer.invoke(IPC.filesAuthStatus),
    connect: (): Promise<FilesAuthState> => ipcRenderer.invoke(IPC.filesAuthStart),
    disconnect: (): Promise<void> => ipcRenderer.invoke(IPC.filesDisconnect),
    sync: (): Promise<{ indexed: number }> => ipcRenderer.invoke(IPC.filesSync),
    removeFolder: (folder: string): Promise<FilesAuthState> => ipcRenderer.invoke(IPC.filesRemoveFolder, folder)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
