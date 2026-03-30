import { ReactNode } from 'react'
import type { Metadata } from 'next'
import { AppQueryProvider } from '../components/query-provider'
import { appThemeCss } from '../lib/theme'

export const metadata: Metadata = {
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: 'var(--app-bg)', color: 'var(--text-primary)' }}>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          body { font-family: 'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace; }
          a { color: inherit; }
          ${appThemeCss}
        `}</style>
        <AppQueryProvider>{children}</AppQueryProvider>
      </body>
    </html>
  )
}
