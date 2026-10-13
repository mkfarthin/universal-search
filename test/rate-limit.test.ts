import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThrottle, isRateLimitError, withRetry } from '../src/main/lib/rate-limit'

describe('isRateLimitError', () => {
  it('recognizes an HTTP 429 response status', () => {
    expect(isRateLimitError({ response: { status: 429 } })).toBe(true)
  })

  it('recognizes a 429 error code', () => {
    expect(isRateLimitError({ code: 429 })).toBe(true)
  })

  it('recognizes quotaExceeded/rateLimitExceeded/userRateLimitExceeded reasons', () => {
    expect(isRateLimitError({ errors: [{ reason: 'quotaExceeded' }] })).toBe(true)
    expect(isRateLimitError({ errors: [{ reason: 'rateLimitExceeded' }] })).toBe(true)
    expect(isRateLimitError({ errors: [{ reason: 'userRateLimitExceeded' }] })).toBe(true)
  })

  it('recognizes the reason nested under response.data.error.errors', () => {
    expect(isRateLimitError({ response: { data: { error: { errors: [{ reason: 'quotaExceeded' }] } } } })).toBe(true)
  })

  it('rejects unrelated errors', () => {
    expect(isRateLimitError(new Error('network down'))).toBe(false)
    expect(isRateLimitError({ response: { status: 500 } })).toBe(false)
    expect(isRateLimitError({ errors: [{ reason: 'notFound' }] })).toBe(false)
    expect(isRateLimitError(null)).toBe(false)
    expect(isRateLimitError(undefined)).toBe(false)
  })
})

describe('withRetry', () => {
  const opts = { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 32000 }

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(withRetry(fn, opts)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries a rate-limit error and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ code: 429 })
      .mockRejectedValueOnce({ code: 429 })
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, opts)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws immediately on a non-rate-limit error without retrying', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withRetry(fn, opts)).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after maxRetries and rethrows the rate-limit error', async () => {
    const fn = vi.fn().mockRejectedValue({ code: 429 })

    const promise = withRetry(fn, opts)
    promise.catch(() => {}) // prevent unhandled rejection warning while timers advance
    await vi.runAllTimersAsync()

    await expect(promise).rejects.toMatchObject({ code: 429 })
    // initial attempt + maxRetries retries
    expect(fn).toHaveBeenCalledTimes(opts.maxRetries + 1)
  })

  it('honors a Retry-After header instead of computing its own backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '5' } } })
      .mockResolvedValueOnce('ok')

    const promise = withRetry(fn, opts)
    await vi.advanceTimersByTimeAsync(4999)
    expect(fn).toHaveBeenCalledTimes(1) // not yet retried

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('createThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs the first call immediately', async () => {
    const throttle = createThrottle(200)
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(throttle(fn)).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('spaces consecutive calls at least minIntervalMs apart', async () => {
    const throttle = createThrottle(200)
    const order: number[] = []
    const fn = async (n: number): Promise<number> => {
      order.push(Date.now())
      return n
    }

    const p1 = throttle(() => fn(1))
    const p2 = throttle(() => fn(2))
    const p3 = throttle(() => fn(3))

    await vi.runAllTimersAsync()
    await Promise.all([p1, p2, p3])

    expect(order).toHaveLength(3)
    expect(order[1] - order[0]).toBeGreaterThanOrEqual(200)
    expect(order[2] - order[1]).toBeGreaterThanOrEqual(200)
  })

  it('keeps independent schedules per throttle instance', async () => {
    const throttleA = createThrottle(1000)
    const throttleB = createThrottle(1000)

    await throttleA(() => Promise.resolve('a1'))
    // B's schedule is untouched by A's calls, so this should run without waiting
    const start = Date.now()
    await throttleB(() => Promise.resolve('b1'))
    expect(Date.now() - start).toBe(0)
  })
})
