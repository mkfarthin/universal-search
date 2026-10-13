/**
 * Google's OAuth2 token endpoint returns `invalid_grant` when a refresh
 * token is dead — revoked by the user, or (very commonly, for an app
 * whose OAuth consent screen is still in "Testing" status) simply expired,
 * since Google caps testing-app refresh tokens at 7 days regardless of
 * use. Either way the fix is the same: clear the stored token and have
 * the user reconnect: the stale credentials, if left in place, would fail
 * the same way on every subsequent sync.
 */
export function isInvalidGrantError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /invalid_grant/i.test(message)
}
