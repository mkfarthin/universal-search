export const IPC = {
  search: 'search:query',
  syncStatus: 'sync:status',

  gmailAuthStatus: 'gmail:auth-status',
  gmailAuthStart: 'gmail:auth-start',
  gmailDisconnect: 'gmail:disconnect',
  gmailSync: 'gmail:sync',

  filesAuthStatus: 'files:auth-status',
  filesAuthStart: 'files:auth-start',
  filesDisconnect: 'files:disconnect',
  filesSync: 'files:sync',
  filesRemoveFolder: 'files:remove-folder'
} as const
