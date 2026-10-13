export function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8')
}

export interface GmailPart {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: GmailPart[] | null
}

/** Recursively finds the first text/plain part in a (possibly nested
 * multipart) Gmail message payload. */
export function extractPlainText(payload: GmailPart | null | undefined): string | null {
  if (!payload) return null
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  for (const part of payload.parts ?? []) {
    const text = extractPlainText(part)
    if (text) return text
  }
  return null
}

export interface GmailHeader {
  name?: string | null
  value?: string | null
}

export function findHeader(headers: GmailHeader[] | null | undefined, name: string): string | null {
  return headers?.find((h) => h.name === name)?.value ?? null
}
