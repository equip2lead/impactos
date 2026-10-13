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
  // Reset-specific: updateUser refuses a new password equal to the old one.
  // Someone who forgot their password will try their usual one first.
  'same_password',
] as const

/**
 * Refusals the screens decide for themselves before calling GoTrue. They are
 * keys rather than copy for the same reason the GoTrue ones are: a message
 * stored as text freezes in whichever language was active when it was set.
 */
export const AUTH_FORM_ERROR_KEYS = [
  'email_required',
  'password_mismatch',
  'password_too_short',
  'org_name_required',
] as const

export type AuthErrorKey =
  | (typeof AUTH_ERROR_KEYS)[number]
  | (typeof AUTH_FORM_ERROR_KEYS)[number]
  | 'timeout'
  | 'generic'

export type AuthErrorStrings = Record<AuthErrorKey, string>

/**
 * Classifies an auth error without choosing any wording. Screens store the
 * key and resolve it with `strings[key]` at render — see ProcError in
 * pgError.ts for why resolving at catch time is wrong.
 *
 * Older releases only set a message, so fall back to matching on its text.
 */
export function authErrorKey(error: AuthError | null | undefined): AuthErrorKey | null {
  if (!error) return null
  const code = (error as { code?: string }).code
  if (code && (AUTH_ERROR_KEYS as readonly string[]).includes(code)) {
    return code as AuthErrorKey
  }
  // Same advice to the user as the request limit; GoTrue counts them apart.
  if (code === 'over_email_send_rate_limit') return 'over_request_rate_limit'
  const m = (error.message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'invalid_credentials'
  if (m.includes('email not confirmed')) return 'email_not_confirmed'
  if (m.includes('rate limit') || error.status === 429) return 'over_request_rate_limit'
  if (m.includes('already registered') || m.includes('already exists')) return 'user_already_exists'
  if (m.includes('password should be') || m.includes('weak password')) return 'weak_password'
  if (m.includes('should be different from the old password')) return 'same_password'
  if (m.includes('is invalid') && m.includes('email')) return 'invalid_email'
  if (m.includes('unable to validate email')) return 'invalid_email'
  console.error('[auth] unmapped auth error', error)
  return 'generic'
}

/**
 * Resolve-immediately convenience over authErrorKey. Only for a result that is
 * consumed at once; anything held in component state must keep the key.
 */
export function authErrorMessage(
  error: AuthError | null | undefined,
  strings: AuthErrorStrings
): string | null {
  const key = authErrorKey(error)
  return key ? strings[key] : null
}
