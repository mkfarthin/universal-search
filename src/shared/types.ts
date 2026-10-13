export interface SearchResult {
  id: string
  source: string
  title: string
  sender: string | null
  timestamp: number
  link: string | null
  /** Plain text with / marking the start/end of matched terms. */
  snippet: string
}

export interface SyncStatus {
  source: string
  state: 'idle' | 'authenticating' | 'syncing' | 'error' | 'done'
  message?: string
  indexed?: number
}

export interface ConnectorAuthState {
  connected: boolean
}

export interface FilesAuthState extends ConnectorAuthState {
  folders: string[]
}

export interface GmailAuthState extends ConnectorAuthState {
  includeSpamTrash: boolean
}
