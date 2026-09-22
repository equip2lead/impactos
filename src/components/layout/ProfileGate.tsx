'use client'

import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { Button } from '@/components/ui'

/**
 * Blocks the dashboard when a session exists but its profile could not be
 * resolved. Rendering the app anyway would run on the defaulted 'viewer' role
 * under a placeholder identity, which looks like a working session and is not.
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const { profileError, retryProfile, loading } = useApp()
  const { t } = useLang()

  if (loading || !profileError) return <>{children}</>

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-2xl p-6 text-center">
        <div className="text-base font-bold text-gray-900 mb-1">{t.profileErrorTitle}</div>
        <p className="text-sm text-gray-500 mb-4">{t.profileErrorBody}</p>
        <p className="text-xs text-gray-400 font-mono mb-4 break-words">{profileError}</p>
        <Button variant="primary" onClick={retryProfile}>{t.retry}</Button>
      </div>
    </div>
  )
}
