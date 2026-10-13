import { describe, expect, it } from 'vitest'
import { decodeBase64Url, extractPlainText, findHeader } from '../src/main/connectors/gmail-parse'

function b64url(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url')
}

describe('decodeBase64Url', () => {
  it('decodes a base64url-encoded string back to utf-8', () => {
    expect(decodeBase64Url(b64url('hello world'))).toBe('hello world')
  })
})

describe('extractPlainText', () => {
  it('returns null for a missing payload', () => {
    expect(extractPlainText(null)).toBeNull()
    expect(extractPlainText(undefined)).toBeNull()
  })

  it('extracts text/plain body data directly on the payload', () => {
    const payload = { mimeType: 'text/plain', body: { data: b64url('plain body') } }
    expect(extractPlainText(payload)).toBe('plain body')
  })

  it('finds text/plain inside a single level of multipart parts', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
        { mimeType: 'text/plain', body: { data: b64url('the plain text') } }
      ]
    }
    expect(extractPlainText(payload)).toBe('the plain text')
  })

  it('finds text/plain nested multiple levels deep', () => {
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/html', body: { data: b64url('<p>html</p>') } },
            { mimeType: 'text/plain', body: { data: b64url('nested plain text') } }
          ]
        },
        { mimeType: 'application/pdf', body: {} }
      ]
    }
    expect(extractPlainText(payload)).toBe('nested plain text')
  })

  it('returns null when no text/plain part exists anywhere', () => {
    const payload = {
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/html', body: { data: b64url('<p>html only</p>') } }]
    }
    expect(extractPlainText(payload)).toBeNull()
  })

  it('treats a text/plain part with no body data as absent, not empty', () => {
    const payload = { mimeType: 'text/plain', body: {} }
    expect(extractPlainText(payload)).toBeNull()
  })
})

describe('findHeader', () => {
  const headers = [
    { name: 'Subject', value: 'Hello' },
    { name: 'From', value: 'a@example.com' }
  ]

  it('finds a header by exact name', () => {
    expect(findHeader(headers, 'Subject')).toBe('Hello')
    expect(findHeader(headers, 'From')).toBe('a@example.com')
  })

  it('returns null when the header is absent', () => {
    expect(findHeader(headers, 'Cc')).toBeNull()
  })

  it('returns null for missing/empty header lists', () => {
    expect(findHeader(null, 'Subject')).toBeNull()
    expect(findHeader(undefined, 'Subject')).toBeNull()
    expect(findHeader([], 'Subject')).toBeNull()
  })
})
