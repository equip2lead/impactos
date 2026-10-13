/**
 * Confirmation / recovery links are a separate failure surface from sign-in.
 *
 * They do not arrive as an AuthError object — they arrive as codes in a URL,
 * sometimes in the query string and sometimes in the fragment, and the person
 * reading the result has done nothing wrong except click a link. Each cause
 * needs a different action from them, so they get distinct copy rather than one
 * catch-all: request a new link, or go and sign in normally.
 */
export const AUTH_LINK_ERROR_KEYS = ['link_expired', 'link_used', 'link_invalid'] as const

export type AuthLinkErrorKey = (typeof AUTH_LINK_ERROR_KEYS)[number]

export function isAuthLinkErrorKey(v: string | null | undefined): v is AuthLinkErrorKey {
  return !!v && (AUTH_LINK_ERROR_KEYS as readonly string[]).includes(v)
}

/**
 * `next` arrives in a URL anyone can craft, and is appended to the origin.
 * `/dashboard` is a path; `@evil.example` would make the origin a userinfo
 * prefix and send the browser off-site. Only same-origin absolute paths pass.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return '/dashboard'
  }
  return raw
}

/**
 * Where a failed link sends the person. A recovery link's reader cannot sign
 * in — that is why they asked — so /login is a dead end for them; the reset
 * page can explain and offer a new link in one place. Everything else goes to
 * /login, which renders the confirmation-link copy.
 */
export function linkFailurePath(next: string, key: AuthLinkErrorKey): string {
  const base = next === '/reset-password' ? '/reset-password' : '/login'
  return `${base}?error=${key}`
}

/**
 * Maps GoTrue's codes onto the three outcomes.
 *
 * A caveat worth keeping: GoTrue often cannot distinguish "expired" from
 * "already used" — both commonly surface as the same access_denied with
 * "Email link is invalid or has expired". Only the PKCE flow-state errors
 * separate them reliably, because the flow state is consumed on first use. So
 * link_used is reported when the evidence actually supports it, and the
 * expired copy is written to still make sense if the real cause was reuse.
 */
export function authLinkErrorKey(
  code: string | null | undefined,
  description?: string | null
): AuthLinkErrorKey {
  const c = (code ?? '').toLowerCase()
  const d = (description ?? '').toLowerCase()

  if (c === 'otp_expired' || c === 'flow_state_expired') return 'link_expired'
  // No verifier in this browser: the link was opened on another device, or
  // after the flow was cleared. That is the most common real failure, and
  // link_invalid's "check you opened the most recent email" is the wrong
  // advice for it — link_expired's copy (signed in already? otherwise request
  // a new link) is the right one.
  if (c === 'pkce_code_verifier_not_found') return 'link_expired'
  // The PKCE flow state is deleted when the code is exchanged, so its absence
  // is real evidence of a second click rather than a guess.
  if (c === 'flow_state_not_found') return 'link_used'
  if (d.includes('expired')) return 'link_expired'
  if (d.includes('already') && d.includes('used')) return 'link_used'
  return 'link_invalid'
}
