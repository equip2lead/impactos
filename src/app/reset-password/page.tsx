'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'
import Link from 'next/link'

type Step = 'request' | 'sent' | 'reset' | 'done'

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>('request')
  const [lang, setLang] = useState<'en'|'fr'>('en')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const t = {
    en: {
      title: 'Reset your password',
      sub: 'Enter your email and we\'ll send you a reset link',
      email: 'Email address', send: 'Send reset link', sending: 'Sending…',
      sentTitle: 'Check your email', sentSub: (e: string) => `We sent a reset link to ${e}. Check your inbox and spam folder.`,
      backToLogin: '← Back to login',
      newPassword: 'New password', confirm: 'Confirm password',
      update: 'Update password', updating: 'Updating…',
      doneTitle: 'Password updated!', doneSub: 'Your password has been updated. You can now sign in.',
      signIn: 'Sign in →',
      mismatch: 'Passwords do not match', short: 'Password must be at least 8 characters',
      noEmail: 'Please enter your email address',
    },
    fr: {
      title: 'Réinitialiser votre mot de passe',
      sub: 'Entrez votre email et nous vous enverrons un lien de réinitialisation',
      email: 'Adresse e-mail', send: 'Envoyer le lien', sending: 'Envoi en cours…',
      sentTitle: 'Vérifiez votre email', sentSub: (e: string) => `Nous avons envoyé un lien à ${e}. Vérifiez votre boîte de réception.`,
      backToLogin: '← Retour à la connexion',
      newPassword: 'Nouveau mot de passe', confirm: 'Confirmer le mot de passe',
      update: 'Mettre à jour', updating: 'Mise à jour…',
      doneTitle: 'Mot de passe mis à jour !', doneSub: 'Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.',
      signIn: 'Se connecter →',
      mismatch: 'Les mots de passe ne correspondent pas', short: 'Le mot de passe doit contenir au moins 8 caractères',
      noEmail: 'Veuillez entrer votre adresse e-mail',
    }
  }[lang]

  const handleRequest = async () => {
    if (!email) return setError(t.noEmail)
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err) return setError(err.message)
    setStep('sent')
  }

  const handleReset = async () => {
    if (password !== confirm) return setError(t.mismatch)
    if (password.length < 8) return setError(t.short)
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) return setError(err.message)
    setStep('done')
  }

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

        {step === 'request' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px' }}>{t.title}</h1>
            <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>{t.sub}</p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@yourorg.org"
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            {error && <div style={{ background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', marginBottom: '12px' }}>{error}</div>}
            <button onClick={handleRequest} disabled={loading}
              style={{ width: '100%', background: '#0A0A0A', color: '#fff', border: 'none', borderRadius: '9px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', marginBottom: '12px', opacity: loading ? 0.7 : 1 }}>
              {loading ? t.sending : t.send}
            </button>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', fontSize: '12px', color: '#888', textDecoration: 'none' }}>{t.backToLogin}</Link>
          </>
        )}

        {step === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '14px' }}>📬</div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>{t.sentTitle}</h2>
            <p style={{ fontSize: '13px', color: '#888', lineHeight: 1.6, marginBottom: '20px' }}>{t.sentSub(email)}</p>
            <Link href="/login" style={{ display: 'block', textAlign: 'center', fontSize: '13px', color: '#4338CA', fontWeight: 600, textDecoration: 'none' }}>{t.backToLogin}</Link>
          </div>
        )}

        {step === 'reset' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '20px' }}>{t.newPassword}</h1>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.newPassword}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.confirm}</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                style={{ width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const }} />
            </div>
            {error && <div style={{ background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#DC2626', marginBottom: '12px' }}>{error}</div>}
            <button onClick={handleReset} disabled={loading}
              style={{ width: '100%', background: '#0A0A0A', color: '#fff', border: 'none', borderRadius: '9px', padding: '11px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? t.updating : t.update}
            </button>
          </>
        )}

        {step === 'done' && (
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
