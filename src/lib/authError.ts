import type { AuthError } from '@supabase/supabase-js'

/**
 * Auth failures arrive as an AuthError, not a PostgrestError — different shape,
 * different codes — so pgError.ts deliberately does not cover them. Without this
 * the login screen rendered Supabase's raw English message regardless of the
 * user's language.
 */
export const AUTH_ERROR_KEYS = [
  'invalid_credentials',
  'email_not_confirmed',
  'over_request_rate_limit',
  // Signup-specific. Both are ordinary things a person does on the register
  // screen, and both rendered as the catch-all before it used this map.
  'user_already_exists',
  'weak_password',
  // GoTrue validates the address and rejects reserved TLDs (.test, .invalid,
  // .example, .localhost) among others. Unmapped, this rendered the catch-all,
  // whose copy says "sign you in" on a signup screen.
  'invalid_email',
] as const

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[number] | 'generic'

export type AuthErrorStrings = Record<AuthErrorKey, string>

/** Older releases only set a message, so fall back to matching on its text. */
function keyFor(error: AuthError): AuthErrorKey {
  const code = (error as { code?: string }).code
  if (code && (AUTH_ERROR_KEYS as readonly string[]).includes(code)) {
    return code as AuthErrorKey
  }
  const m = (error.message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'invalid_credentials'
  if (m.includes('email not confirmed')) return 'email_not_confirmed'
  if (m.includes('rate limit') || error.status === 429) return 'over_request_rate_limit'
  if (m.includes('already registered') || m.includes('already exists')) return 'user_already_exists'
  if (m.includes('password should be') || m.includes('weak password')) return 'weak_password'
  if (m.includes('is invalid') && m.includes('email')) return 'invalid_email'
  if (m.includes('unable to validate email')) return 'invalid_email'
  return 'generic'
}

/** Returns translated copy for an auth error, or null when there was none. */
export function authErrorMessage(
  error: AuthError | null | undefined,
  strings: AuthErrorStrings
): string | null {
  if (!error) return null
  const key = keyFor(error)
  if (key === 'generic') console.error('[auth] unmapped auth error', error)
  return strings[key]
}
