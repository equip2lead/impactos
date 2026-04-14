'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useLang } from '@/context/LangContext'

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
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {/* Lang toggle */}
      <div className="absolute top-4 right-4 flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
        <button onClick={() => setLang('en')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang==='en'?'bg-gray-900 text-white':'text-gray-500 hover:text-gray-700'}`}>
          EN
        </button>
        <button onClick={() => setLang('fr')}
          className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${lang==='fr'?'bg-gray-900 text-white':'text-gray-500 hover:text-gray-700'}`}>
          FR
        </button>
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
            <div className="w-5 h-5 bg-amber-400 rounded-md" />
          </div>
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight leading-none">IMPACTOS</div>
            <div className="text-xs text-gray-400 font-medium">AFRILEAD · Yaoundé</div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-1">{t.welcomeBack}</h1>
          <p className="text-sm text-gray-400 mb-6">{t.signInSub}</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.email}</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required placeholder="you@afrilead.org"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">{t.password}</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-indigo-400 transition-colors placeholder:text-gray-300"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? t.signingIn : t.signIn}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-5">
            {t.noAccount} {t.contactAdmin}
          </p>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-gray-300">
          IMPACTOS · Powered by AFRILEAD
        </div>
      </div>
    </div>
  )
}
