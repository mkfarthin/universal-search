/**
 * Contract every data source (Gmail, Files, WhatsApp, …) implements so the
 * search core and IPC layer don't need to know source-specific details.
 */
export interface SourceConnector {
  readonly id: string
  isConnected(): boolean
  connect(): Promise<void>
  disconnect(): void
  sync(onProgress?: (indexed: number) => void): Promise<{ indexed: number }>
}
