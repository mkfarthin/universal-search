import { describe, expect, it } from 'vitest'
import { isInvalidGrantError } from '../src/main/connectors/gmail-errors'

describe('isInvalidGrantError', () => {
  it('recognizes an Error whose message is invalid_grant', () => {
    expect(isInvalidGrantError(new Error('invalid_grant'))).toBe(true)
  })

  it('recognizes invalid_grant embedded in a longer message', () => {
    expect(isInvalidGrantError(new Error('Token refresh failed: invalid_grant (Token has been expired or revoked.)'))).toBe(
      true
    )
  })

  it('is case-insensitive', () => {
    expect(isInvalidGrantError(new Error('Invalid_Grant'))).toBe(true)
  })

  it('recognizes a plain string thrown instead of an Error', () => {
    expect(isInvalidGrantError('invalid_grant')).toBe(true)
  })

  it('rejects unrelated errors', () => {
    expect(isInvalidGrantError(new Error('network timeout'))).toBe(false)
    expect(isInvalidGrantError(new Error('invalid_request'))).toBe(false)
    expect(isInvalidGrantError(null)).toBe(false)
    expect(isInvalidGrantError(undefined)).toBe(false)
  })
})
