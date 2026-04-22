'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useLang } from '@/context/LangContext'
import Link from 'next/link'

export default function LoginPage() {
  const { t, lang, setLang } = useLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Lang toggle */}
      <div className="absolute top-4 right-4 flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
        <button onClick={() => setLang('en')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang==='en'?'bg-gray-900 text-white':'text-gray-500 hover:text-gray-700'}`}>EN</button>
        <button onClick={() => setLang('fr')} className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang==='fr'?'bg-gray-900 text-white':'text-gray-500 hover:text-gray-700'}`}>FR</button>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
            <div className="w-5 h-5 bg-amber-400 rounded-md" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight leading-none">IMPACTOS</div>
            <div className="text-xs text-gray-400 font-medium">useimpactos.com</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-1">{t.welcomeBack}</h1>
          <p className="text-sm text-gray-400 mb-6">{t.signInSub}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.email}</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@yourorg.org"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors placeholder:text-gray-300" />
            </div>
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-gray-500">{t.password}</label>
                <Link href="/reset-password" className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                  {lang === 'fr' ? 'Mot de passe oublié ?' : 'Forgot password?'}
                </Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors placeholder:text-gray-300" />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">
              {lang === 'fr' ? 'Nouvelle organisation ?' : 'New organisation?'}{' '}
              <Link href="/register" className="text-indigo-600 font-semibold hover:text-indigo-800">
                {lang === 'fr' ? 'Créer un espace gratuit' : 'Create free workspace'}
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-gray-300">IMPACTOS · useimpactos.com</div>
      </div>
    </div>
  )
}
