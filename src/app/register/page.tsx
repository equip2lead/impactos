'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { withTimeout } from '@/lib/withTimeout'
import { authErrorMessage as authMessage } from '@/lib/authError'
import { useRouter } from 'next/navigation'
import { useLang } from '@/context/LangContext'
import Link from 'next/link'

type Step = 'org' | 'account' | 'done'

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('org')
  // The toggle drives the app-wide language (and its cookie) rather than a
  // local copy — otherwise picking French here is forgotten at the dashboard.
  // T is the shared table; t below is the copy specific to this screen.
  const { lang, setLang, t: T } = useLang()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [org, setOrg] = useState({
    name: '', type: 'ngo', city: '', country: 'Cameroon', email: '', phone: '', website: ''
  })
  const [account, setAccount] = useState({
    firstName: '', lastName: '', email: '', password: '', confirm: ''
  })

  const t = {
    en: {
      title: 'Create your IMPACTOS workspace',
      sub: 'Set up your organisation and get started in 2 minutes',
      step1: 'Organisation', step2: 'Your account', step3: 'Done',
      orgName: 'Organisation name', orgType: 'Organisation type',
      city: 'City', country: 'Country', orgEmail: 'Organisation email',
      phone: 'Phone number', website: 'Website (optional)',
      next: 'Continue →', back: '← Back',
      firstName: 'First name', lastName: 'Last name',
      email: 'Your email', password: 'Password', confirm: 'Confirm password',
      create: 'Create workspace', creating: 'Creating…',
      doneTitle: 'Workspace created!',
      doneSub: 'Your IMPACTOS workspace is ready. Sign in to get started.',
      goToApp: 'Go to app →',
      haveAccount: 'Already have an account?', signIn: 'Sign in',
      types: { ngo: 'NGO / Non-profit', church: 'Church / Faith organisation', academy: 'Training academy', government: 'Government program', enterprise: 'Social enterprise', csr: 'CSR / Foundation', other: 'Other' },
      passwordMismatch: 'Passwords do not match',
      passwordShort: 'Password must be at least 8 characters',
      orgNameRequired: 'Enter a name for your organisation',
      confirmTitle: 'Check your email',
      confirmSub: 'Your workspace is created. Confirm your email address to sign in for the first time.',
      doneSubReady: 'Your IMPACTOS workspace is ready and you are signed in.',
    },
    fr: {
      title: 'Créer votre espace IMPACTOS',
      sub: 'Configurez votre organisation en 2 minutes',
      step1: 'Organisation', step2: 'Votre compte', step3: 'Terminé',
      orgName: "Nom de l'organisation", orgType: "Type d'organisation",
      city: 'Ville', country: 'Pays', orgEmail: 'Email organisation',
      phone: 'Téléphone', website: 'Site web (optionnel)',
      next: 'Continuer →', back: '← Retour',
      firstName: 'Prénom', lastName: 'Nom',
      email: 'Votre email', password: 'Mot de passe', confirm: 'Confirmer le mot de passe',
      create: "Créer l'espace", creating: 'Création en cours…',
      doneTitle: 'Espace créé !',
      doneSub: 'Votre espace IMPACTOS est prêt. Connectez-vous pour commencer.',
      goToApp: "Accéder à l'application →",
      haveAccount: 'Déjà un compte ?', signIn: 'Se connecter',
      types: { ngo: 'ONG / Association', church: 'Église / Organisation religieuse', academy: 'Académie de formation', government: 'Programme gouvernemental', enterprise: 'Entreprise sociale', csr: 'RSE / Fondation', other: 'Autre' },
      passwordMismatch: 'Les mots de passe ne correspondent pas',
      passwordShort: 'Le mot de passe doit contenir au moins 8 caractères',
      orgNameRequired: 'Saisissez un nom pour votre organisation',
      confirmTitle: 'Vérifiez votre e-mail',
      confirmSub: "Votre espace est créé. Confirmez votre adresse e-mail pour vous connecter la première fois.",
      doneSubReady: 'Votre espace IMPACTOS est prêt et vous êtes connecté.',
    }
  }[lang]

  const steps: Step[] = ['org', 'account', 'done']
  const stepIdx = steps.indexOf(step)

  const handleCreateWorkspace = async () => {
    if (account.password !== account.confirm) return setError(t.passwordMismatch)
    if (account.password.length < 8) return setError(t.passwordShort)
    if (!org.name.trim()) return setError(t.orgNameRequired)
    setLoading(true)
    setError('')

    // One call. handle_new_user creates the profile, the organisation and the
    // ownership binding in a single transaction, so a failed signup cannot
    // leave an ownerless organisation behind — which is what the previous
    // version did by inserting the organisation from the browser first.
    //
    // role and org_id are deliberately NOT sent: the trigger ignores them, and
    // a client that could name its own role would be choosing its own
    // permissions. The slug is generated server-side too.
    const raced = await withTimeout(supabase.auth.signUp({
      email: account.email,
      password: account.password,
      options: {
        // Explicit, derived from the host that actually initiated signup.
        // Without this the link goes to the project's configured Site URL, so
        // a signup started on localhost sends the customer to production —
        // a different build from the one being exercised. Correct for dev and
        // production both, and independent of a dashboard setting.
        //
        // THE QUERY STRING HERE IS LOAD-BEARING. The Confirm signup email
        // template appends to this value directly:
        //
        //   <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">
        //
        // so it concatenates with `&`, not `?`. If this URL ever loses its
        // `?next=…` the template produces `/auth/callback&token_hash=…`, which
        // is a path, not a query — the callback would see no token and send
        // the user to /login as an invalid link. Keep a query parameter here.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        data: {
          first_name: account.firstName,
          last_name: account.lastName,
          org_name: org.name.trim(),
          org_details: {
            city: org.city, country: org.country, email: org.email,
            phone: org.phone, website: org.website, description: org.type,
          },
        },
      },
    }))

    if (raced.timedOut) { setLoading(false); return setError(T.procErrors.timeout) }
    const { data, error: authErr } = raced.value
    if (authErr) {
      setLoading(false)
      return setError(authMessage(authErr, T.authErrors) ?? T.procErrors.generic)
    }

    // With email confirmation on, signUp returns no session. Saying "signed
    // in" then bouncing off the dashboard would be worse than saying nothing,
    // so the final screen reflects which actually happened.
    setNeedsConfirmation(!data.session)
    setLoading(false)
    setStep('done')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F9FAFB', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif' }}>

      {/* Lang toggle */}
      <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '2px', background: '#fff', border: '0.5px solid #E4E7EF', borderRadius: '8px', padding: '2px' }}>
        {(['en','fr'] as const).map(l => (
          <button key={l} onClick={() => setLang(l)}
            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer', background: lang === l ? '#0A0A0A' : 'transparent', color: lang === l ? '#fff' : '#888' }}>
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

      <div style={{ width: '100%', maxWidth: '460px' }}>
        {step !== 'done' && (
          <>
            <h1 style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '6px', textAlign: 'center' }}>{t.title}</h1>
            <p style={{ fontSize: '13px', color: '#888', textAlign: 'center', marginBottom: '28px' }}>{t.sub}</p>

            {/* Step indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
              {[t.step1, t.step2].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, background: stepIdx >= i ? '#0A0A0A' : '#E4E7EF', color: stepIdx >= i ? '#fff' : '#aaa' }}>{i + 1}</div>
                    <span style={{ fontSize: '12px', fontWeight: stepIdx === i ? 600 : 400, color: stepIdx === i ? '#0A0A0A' : '#aaa' }}>{s}</span>
                  </div>
                  {i < 1 && <div style={{ width: '32px', height: '1px', background: stepIdx > i ? '#0A0A0A' : '#E4E7EF' }} />}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ background: '#fff', borderRadius: '16px', border: '0.5px solid #E4E7EF', padding: '28px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

          {/* STEP 1 — ORG */}
          {step === 'org' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.orgName} *</label>
                <input value={org.name} onChange={e => setOrg(o => ({ ...o, name: e.target.value }))}
                  placeholder="e.g. AFRILEAD" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.orgType} *</label>
                <select value={org.type} onChange={e => setOrg(o => ({ ...o, type: e.target.value }))} style={inputStyle}>
                  {Object.entries(t.types).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.city}</label>
                  <input value={org.city} onChange={e => setOrg(o => ({ ...o, city: e.target.value }))} placeholder="Yaoundé" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.country}</label>
                  <input value={org.country} onChange={e => setOrg(o => ({ ...o, country: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.orgEmail}</label>
                <input type="email" value={org.email} onChange={e => setOrg(o => ({ ...o, email: e.target.value }))} placeholder="info@yourorg.org" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.phone}</label>
                  <input value={org.phone} onChange={e => setOrg(o => ({ ...o, phone: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.website}</label>
                  <input value={org.website} onChange={e => setOrg(o => ({ ...o, website: e.target.value }))} placeholder="yourorg.org" style={inputStyle} />
                </div>
              </div>
              {error && <div style={errorBoxStyle}>{error}</div>}
              <button onClick={() => org.name.trim() ? setStep('account') : setError(t.orgNameRequired)}
                style={btnStyle('#0A0A0A', '#fff')}>{t.next}</button>
            </div>
          )}

          {/* STEP 2 — ACCOUNT */}
          {step === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.firstName} *</label>
                  <input value={account.firstName} onChange={e => setAccount(a => ({ ...a, firstName: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.lastName} *</label>
                  <input value={account.lastName} onChange={e => setAccount(a => ({ ...a, lastName: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.email} *</label>
                <input type="email" value={account.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} placeholder="you@yourorg.org" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.password} *</label>
                <input type="password" value={account.password} onChange={e => setAccount(a => ({ ...a, password: e.target.value }))} placeholder="Min. 8 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#555', display: 'block', marginBottom: '4px' }}>{t.confirm} *</label>
                <input type="password" value={account.confirm} onChange={e => setAccount(a => ({ ...a, confirm: e.target.value }))} style={inputStyle} />
              </div>
              {error && <div style={errorBoxStyle}>{error}</div>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setStep('org')} style={btnStyle('#F4F6FA', '#0A0A0A')}>{t.back}</button>
                <button onClick={handleCreateWorkspace} disabled={loading} style={{ ...btnStyle('#0A0A0A', '#fff'), flex: 1, opacity: loading ? 0.7 : 1 }}>
                  {loading ? t.creating : t.create}
                </button>
              </div>
            </div>
          )}

          {/* DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ width: '56px', height: '56px', background: needsConfirmation ? '#FFFBEB' : '#ECFDF5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>
                {needsConfirmation ? '✉️' : '✅'}
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '8px' }}>
                {needsConfirmation ? t.confirmTitle : t.doneTitle}
              </h2>
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '24px', lineHeight: 1.6 }}>
                {needsConfirmation ? t.confirmSub : t.doneSubReady}
              </p>
              {needsConfirmation
                ? <Link href="/login" style={{ ...btnStyle('#0A0A0A', '#fff'), display: 'block', textDecoration: 'none', textAlign: 'center' }}>{t.signIn}</Link>
                : <button onClick={() => router.push('/dashboard')} style={btnStyle('#0A0A0A', '#fff')}>{t.goToApp}</button>}
            </div>
          )}
        </div>

        {step !== 'done' && (
          <p style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', marginTop: '16px' }}>
            {t.haveAccount}{' '}
            <Link href="/login" style={{ color: '#4338CA', fontWeight: 600, textDecoration: 'none' }}>{t.signIn}</Link>
          </p>
        )}
      </div>
    </div>
  )
}

const errorBoxStyle: React.CSSProperties = {
  background: '#FEF2F2', border: '0.5px solid #FECDCA', borderRadius: '8px',
  padding: '10px', fontSize: '12px', color: '#DC2626',
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '0.5px solid #E4E7EF', borderRadius: '8px',
  padding: '8px 12px', fontSize: '13px', color: '#0A0A0A',
  background: '#fff', outline: 'none', boxSizing: 'border-box',
}

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    width: '100%', background: bg, color, border: 'none',
    borderRadius: '9px', padding: '11px', fontSize: '13px',
    fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.2px',
  }
}
