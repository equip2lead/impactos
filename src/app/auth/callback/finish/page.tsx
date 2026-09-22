'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'
import { useLang } from '@/context/LangContext'
import { authLinkErrorKey } from '@/lib/authLinkError'

/**
 * The implicit flow returns its tokens in the URL fragment, which browsers
 * never send to the server — so /auth/callback cannot see it and hands off
 * here. This reads the fragment, establishes the session, and sends the user
 * on. Any failure is forwarded to /login as a mapped reason rather than
 * dropped, which is what made the old callback fail silently.
 */
function Finish() {
  const router = useRouter()
  const params = useSearchParams()
  const { t } = useLang()
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const next = params.get('next') ?? '/dashboard'
      // Strip the leading '#'. Nothing here is logged: the fragment carries
      // access and refresh tokens.
      const hash = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
      )

      const err = hash.get('error')
      const errCode = hash.get('error_code')
      const errDesc = hash.get('error_description')
      if (err || errCode) {
        const key = authLinkErrorKey(errCode ?? err, errDesc)
        console.error(`[auth/callback/finish] fragment-error -> ${key}`)
        return router.replace(`/login?error=${key}`)
      }

      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      if (!accessToken || !refreshToken) {
        // No query token and no fragment token: the link carried nothing we
        // recognise. This is also the path a user reaches by opening
        // /auth/callback directly.
        console.error('[auth/callback/finish] no token in query or fragment -> link_invalid')
        return router.replace('/login?error=link_invalid')
      }

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (cancelled) return
      if (error) {
        const key = authLinkErrorKey((error as { code?: string }).code, error.message)
        console.error(`[auth/callback/finish] fragment (type=${hash.get('type') ?? '?'}) -> ${key}`, error.message)
        return router.replace(`/login?error=${key}`)
      }
      console.log(`[auth/callback/finish] fragment (type=${hash.get('type') ?? '?'}) -> session established`)
      // Clear the fragment so the tokens do not sit in history.
      window.history.replaceState(null, '', window.location.pathname)
      router.replace(next)
    }
    run()
    // If the redirect has not happened after a few seconds, say something
    // rather than leaving a blank page spinning forever.
    const timer = setTimeout(() => { if (!cancelled) setStuck(true) }, 8000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [params, router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-sm text-gray-400">
        {stuck ? t.authErrors.generic : t.loading}
      </div>
    </div>
  )
}

export default function FinishPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side bailout during prerender.
  return (
    <Suspense fallback={null}>
      <Finish />
    </Suspense>
  )
}
