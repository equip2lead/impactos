import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { AppProvider } from '@/hooks/useApp'
import { LangProvider } from '@/context/LangContext'

export const metadata: Metadata = {
  title: 'IMPACTOS — Program Management',
  description: 'NGO & Program Management Platform by AFRILEAD',
  manifest: '/manifest.json',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the language on the server so SSR and hydration agree. Previously the
  // provider read localStorage during render, which the server cannot see, so
  // every page mismatched for anyone not running in English.
  const cookieStore = await cookies()
  const lang = cookieStore.get('impactos_lang')?.value === 'fr' ? 'fr' : 'en'

  return (
    <html lang={lang}>
      <body className="antialiased bg-gray-50">
        <LangProvider initialLang={lang}>
          <AppProvider>
            {children}
          </AppProvider>
        </LangProvider>
      </body>
    </html>
  )
}
