/**
 * Generic rate-limit handling for any HTTP-based API client: detecting a
 * quota/rate-limit error, retrying it with backoff, and proactively
 * throttling a sustained stream of calls so the limit isn't hit in the
 * first place. Kept free of any particular API client's types so it's
 * reusable across connectors and testable without mocking Electron or a
 * network client.
 */

export interface ApiError {
  response?: {
    status?: number
    headers?: Record<string, string>
    data?: { error?: { errors?: { reason?: string }[] } }
  }
  code?: number
  errors?: { reason?: string }[]
}

export function isRateLimitError(err: unknown): boolean {
  const e = err as ApiError
  if (e?.response?.status === 429 || e?.code === 429) return true
  const reason = e?.errors?.[0]?.reason ?? e?.response?.data?.error?.errors?.[0]?.reason
  return typeof reason === 'string' && /rateLimitExceeded|quotaExceeded|userRateLimitExceeded/i.test(reason)
}

export interface RetryOptions {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

/**
 * Retries `fn` with exponential backoff and jitter on a rate-limit error,
 * honoring a Retry-After header when the API supplies one. Any other error,
 * or a rate-limit error past maxRetries, is rethrown as-is.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= opts.maxRetries) throw err
      const retryAfter = (err as ApiError)?.response?.headers?.['retry-after']
      const delay = retryAfter
        ? Number(retryAfter) * 1000
        : Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt) * (0.5 + Math.random() * 0.5)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export type Throttle = <T>(fn: () => Promise<T>) => Promise<T>

/**
 * Returns a function that spaces calls at least `minIntervalMs` apart.
 * Each call to createThrottle gets its own independent schedule — this
 * matters for tests and for keeping multiple connectors' rate limits from
 * interfering with each other.
 */
export function createThrottle(minIntervalMs: number): Throttle {
  let nextSlot = 0
  return async function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const runAt = Math.max(now, nextSlot)
    nextSlot = runAt + minIntervalMs
    if (runAt > now) await new Promise((resolve) => setTimeout(resolve, runAt - now))
    return fn()
  }
}
