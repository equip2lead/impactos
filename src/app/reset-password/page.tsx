'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useLang } from '@/context/LangContext'
import { withTimeout } from '@/lib/withTimeout'
import { authErrorKey, type AuthErrorKey } from '@/lib/authError'
import { isAuthLinkErrorKey, type AuthLinkErrorKey } from '@/lib/authLinkError'

type Step = 'request' | 'sent' | 'reset' | 'done'

// GoTrue sends the email before it answers, so this call takes as long as the
// SMTP hand-off. At the 5s default a slow send reported failure for an email
// that then arrived.
const SEND_TIMEOUT_MS = 15000

function ResetPassword() {
  // The toggle drives the app-wide language rather than a local copy, as on
  // register. T is the shared table; t below is the copy for this screen.
  const { lang, setLang, t: T } = useLang()
  const params = useSearchParams()
  const [step, setStep] = useState<Step>('request')
  // Until we know whether a recovery session has arrived, show neither form:
  // flashing the request form at someone who just clicked their link is the
  // exact symptom this page had for every user, in every build.
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  // The key, not the copy: resolved at render so it follows the toggle.
  const [error, setError] = useState<AuthErrorKey | null>(null)
  const supabase = createClient()

  // /auth/callback sends a failed recovery link back here rather than to
  // /login — the reader cannot sign in, which is why they are here.
  const linkErrorParam = params.get('error')
  const linkError: AuthLinkErrorKey | null = isAuthLinkErrorKey(linkErrorParam)
    ? linkErrorParam
    : linkErrorParam ? 'link_invalid' : null

  const t = {
    en: {
      title: 'Reset your password',
      sub: 'Enter your email and we\'ll send you a reset link',
      email: 'Email address', send: 'Send reset link', sending: 'Sending…',
      sentTitle: 'Check your email', sentSub: (e: string) => `We sent a reset link to ${e}. Check your inbox and spam folder.`,
      backToLogin: '← Back to login',
      newPassword: 'New password', confirm: 'Confirm password',
      update: 'Update password', updating: 'Updating…',
      doneTitle: 'Password updated!', doneSub: 'Your password has been updated and you have been signed out everywhere. Sign in with your new password.',
      signIn: 'Sign in →',
      linkErrors: {
        link_expired: 'That reset link has expired. Request a new one below.',
        link_used: 'That reset link has already been used. Request a new one below.',
        link_invalid: 'That reset link could not be read. Make sure you opened the most recent email, or request a new one below.',
      } satisfies Record<AuthLinkErrorKey, string>,
    },
    fr: {
      title: 'Réinitialiser votre mot de passe',
      sub: 'Entrez votre email et nous vous enverrons un lien de réinitialisation',
      email: 'Adresse e-mail', send: 'Envoyer le lien', sending: 'Envoi en cours…',
      sentTitle: 'Vérifiez votre email', sentSub: (e: string) => `Nous avons envoyé un lien à ${e}. Vérifiez votre boîte de réception.`,
      backToLogin: '← Retour à la connexion',
      newPassword: 'Nouveau mot de passe', confirm: 'Confirmer le mot de passe',
      update: 'Mettre à jour', updating: 'Mise à jour…',
      doneTitle: 'Mot de passe mis à jour !', doneSub: 'Votre mot de passe a été mis à jour et vous avez été déconnecté partout. Connectez-vous avec votre nouveau mot de passe.',
      signIn: 'Se connecter →',
      linkErrors: {
        link_expired: 'Ce lien de réinitialisation a expiré. Demandez-en un nouveau ci-dessous.',
        link_used: 'Ce lien de réinitialisation a déjà été utilisé. Demandez-en un nouveau ci-dessous.',
        link_invalid: "Ce lien de réinitialisation n'a pas pu être lu. Vérifiez que vous avez ouvert le message le plus récent, ou demandez-en un nouveau ci-dessous.",
      } satisfies Record<AuthLinkErrorKey, string>,
    }
  }[lang]

  // The step nothing used to set. A recovery session reaches this page by one
  // of two routes, and either one moves it to 'reset':
  //
  //  - /auth/callback verified the link server-side (token_hash or ?code=) and
  //    redirected here with the session already in cookies. No auth event
  //    fires for that in this tab, so the session itself is the signal.
  //  - The client processed the link itself — a fragment, or a pre-0c email
  //    that still points at /reset-password?code= — and emits
  //    PASSWORD_RECOVERY.
  //
  // A signed-in user who simply opens this page also lands on 'reset'. That is
  // deliberate: holding a session already permits updateUser, so the form
  // grants nothing the session did not.
  useEffect(() => {
    const client = createClient()
    let cancelled = false
    const { data: { subscription } } = client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') { setStep('reset'); setChecking(false) }
    })
    ;(async () => {
      // getUser waits for the client's own URL handling, so a link it
      // consumes has already produced its session by the time this resolves.
      const raced = await withTimeout(client.auth.getUser())
      if (cancelled) return
      // A failed link is the more useful thing to show, even to someone who
      // happens to hold a session; it is why they are on this page.
      if (!linkError && !raced.timedOut && raced.value.data.user) {
        setStep(s => (s === 'request' ? 'reset' : s))
      }
      setChecking(false)
    })()
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [linkError])

  const handleRequest = async () => {
    if (!email.trim()) return setError('email_required')
    setLoading(true); setError(null)
    const raced = await withTimeout(supabase.auth.resetPasswordForEmail(email.trim(), {
      // One route parses every token shape — PKCE ?code=, token_hash, query
      // errors, the fragment — and sends recovery here once it has a session.
      //
      // THE QUERY STRING HERE IS LOAD-BEARING. The Reset Password email
      // template appends to this value directly:
      //
      //   <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">
      //
      // so it concatenates with `&`, not `?`. If this URL ever loses its
      // `?next=…` the template produces `/auth/callback&token_hash=…`, which
      // is a path, not a query. Keep a query parameter here.
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    }), SEND_TIMEOUT_MS)
    setLoading(false)
    if (raced.timedOut) return setError('timeout')
    if (raced.value.error) return setError(authErrorKey(raced.value.error) ?? 'generic')
    setStep('sent')
  }

  const handleReset = async () => {
    if (password !== confirm) return setError('password_mismatch')
    if (password.length < 8) return setError('password_too_short')
    setLoading(true); setError(null)
    const raced = await withTimeout(supabase.auth.updateUser({ password }))
    if (raced.timedOut) { setLoading(false); return setError('timeout') }
    if (raced.value.error) {
      setLoading(false)
      return setError(authErrorKey(raced.value.error) ?? 'generic')
    }
    // Every session ends, this one included. Someone resetting a password may
    // be doing it because another device has it, and the done screen sends
    // them to /login — which bounces a signed-in user to the dashboard, so a
    // surviving session would make "sign in" a lie. The password is already
    // changed; a failure here is logged and does not hold the user back.
    const out = await withTimeout(supabase.auth.signOut({ scope: 'global' }))
    if (out.timedOut || out.value.error) {
      console.error('[reset-password] password updated but sign-out did not complete', out)
    }
    setLoading(false)
    setStep('done')
  }

  const shownError = error ? T.authErrors[error] : null

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>

      {/* Lang toggle */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '2px', background: '#fff', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '2px' }}>
        {(['en','fr'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: lang === l ? '#0A0A0A' : 'transparent', color: lang === l ? '#fff' : '#888' }}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px' }}>
        <div style={{ width: '32px', height: '32px', background: '#0A0A0A', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '14px', height: '14px', background: '#FFBE00', borderRadius: '3px' }} />
        </div>
        <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.4px' }}>IMPACTOS</span>
      </div>

      <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '16px', border: '0.5px solid #E4E7EF', padding: '28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        {checking && (
          <div style={{ textAlign: 'center', fontSize: '13px', color: '#888' }}>{T.loading}</div>
        )}

        {!checking && step === 'request' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>{t.title}</h1>
            <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>{t.sub}</p>
            {linkError && !error && <div style={{ background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', marginBottom: '14px' }}>{t.linkErrors[linkError]}</div>}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@yourorg.org"
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            {shownError && <div style={{ background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', marginBottom: '12px' }}>{shownError}</div>}
            <button onClick={handleRequest} disabled={loading}
              style={{ width: '100%', background: '#0A0A0A', color: '#fff', border: 'none', borderRadius: '9px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '12px', opacity: loading ? 0.7 : 1 }}>
              {loading ? t.sending : t.send}
            </button>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: '#888', textDecoration: 'none' }}>{t.backToLogin}</Link>
          </>
        )}

        {!checking && step === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px' }}>📬</div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>{t.sentTitle}</h2>
            <p style={{ fontSize: '13px', color: '#888', lineHeight: 1.6, marginBottom: '20px' }}>{t.sentSub(email)}</p>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', fontSize: '13px', color: '#4338CA', fontWeight: 600, textDecoration: 'none' }}>{t.backToLogin}</Link>
          </div>
        )}

        {!checking && step === 'reset' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '20px' }}>{t.newPassword}</h1>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.newPassword}</label>
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.confirm}</label>
              <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            {shownError && <div style={{ background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', marginBottom: '12px' }}>{shownError}</div>}
            <button onClick={handleReset} disabled={loading}
              style={{ width: '100%', background: '#0A0A0A', color: '#fff', border: 'none', borderRadius: '9px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? t.updating : t.update}
            </button>
          </>
        )}

        {!checking && step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px' }}>✅</div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>{t.doneTitle}</h2>
            <p style={{ fontSize: '13px', color: '#888', lineHeight: 1.6, marginBottom: '20px' }}>{t.doneSub}</p>
            <Link href="/login" style={{ display: 'block', background: '#0A0A0A', color: '#fff', textDecoration: 'none', padding: '11px', borderRadius: '9px', fontSize: '13px', fontWeight: 700, textAlign: 'center' }}>{t.signIn}</Link>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <ResetPassword />
    </Suspense>
  )
}
