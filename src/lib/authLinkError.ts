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
  // The PKCE flow state is deleted when the code is exchanged, so its absence
  // is real evidence of a second click rather than a guess.
  if (c === 'flow_state_not_found') return 'link_used'
  if (d.includes('expired')) return 'link_expired'
  if (d.includes('already') && d.includes('used')) return 'link_used'
  return 'link_invalid'
}
