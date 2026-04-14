import type { Metadata } from 'next'
import './globals.css'
import { AppProvider } from '@/hooks/useApp'
import { LangProvider } from '@/context/LangContext'

export const metadata: Metadata = {
  title: 'IMPACTOS — Program Management',
  description: 'NGO & Program Management Platform by AFRILEAD',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50">
        <LangProvider>
          <AppProvider>
            {children}
          </AppProvider>
        </LangProvider>
      </body>
    </html>
  )
}
