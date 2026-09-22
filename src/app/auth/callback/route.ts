import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { authLinkErrorKey } from '@/lib/authLinkError'

// token_hash links are email links by construction; the SMS types cannot
// arrive here. Narrowed explicitly so an unexpected value is refused as a
// malformed link rather than cast blindly into the client.
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email',
]
const asEmailOtpType = (v: string): EmailOtpType | null =>
  (EMAIL_OTP_TYPES as readonly string[]).includes(v) ? (v as EmailOtpType) : null

/**
 * Handles every shape GoTrue can send a confirmation or recovery link back in.
 * Which one arrives depends on the project's flow type and email template, and
 * previously only `?code=` was handled — anything else fell through to a bare
 * redirect whose reason was discarded, so a customer who could not get in had
 * nothing to act on and nothing to report.
 *
 *   ?code=…                  PKCE           -> exchangeCodeForSession
 *   ?token_hash=…&type=…     verifyOtp      -> verifyOtp
 *   ?error=…&error_code=…    refusal        -> map and surface
 *   #access_token=…          implicit       -> not visible to a route handler;
 *                                              handed to /auth/callback/finish
 *
 * Every outcome is logged with the shape that produced it, so a failure in the
 * field can be diagnosed from the server log rather than guessed at.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/dashboard'

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const err = searchParams.get('error')
  const errCode = searchParams.get('error_code')
  const errDesc = searchParams.get('error_description')

  const fail = (key: string, shape: string, detail?: unknown) => {
    console.error(`[auth/callback] ${shape} -> ${key}`, detail ?? '')
    return NextResponse.redirect(`${origin}/login?error=${key}`)
  }

  // 1. GoTrue refused before we ever got a token.
  if (err || errCode) {
    return fail(authLinkErrorKey(errCode ?? err, errDesc), 'query-error', errDesc)
  }

  const supabase = async () => {
    const cookieStore = await cookies()
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
  }

  // 2. PKCE.
  if (code) {
    const client = await supabase()
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (!error) {
      console.log('[auth/callback] pkce -> session established')
      return NextResponse.redirect(`${origin}${next}`)
    }
    return fail(
      authLinkErrorKey((error as { code?: string }).code, error.message),
      'pkce', error.message
    )
  }

  // 3. verifyOtp. `type` names what the link was for; without it there is
  //    nothing to verify against, so that is a malformed link rather than a
  //    failed one.
  if (tokenHash) {
    if (!type) return fail('link_invalid', 'token_hash-without-type')
    const otpType = asEmailOtpType(type)
    if (!otpType) return fail('link_invalid', `token_hash-unknown-type (${type})`)
    const client = await supabase()
    const { error } = await client.auth.verifyOtp({ type: otpType, token_hash: tokenHash })
    if (!error) {
      console.log(`[auth/callback] token_hash (type=${type}) -> session established`)
      return NextResponse.redirect(`${origin}${next}`)
    }
    return fail(
      authLinkErrorKey((error as { code?: string }).code, error.message),
      `token_hash (type=${type})`, error.message
    )
  }

  // 4. Nothing usable in the query. The fragment is never sent to the server,
  //    so it can only be read in the browser — hand off rather than declaring
  //    the link invalid on evidence we cannot see.
  console.log('[auth/callback] no query token — deferring to client for fragment')
  const handoff = new URL(`${origin}/auth/callback/finish`)
  handoff.searchParams.set('next', next)
  return NextResponse.redirect(handoff)
}
