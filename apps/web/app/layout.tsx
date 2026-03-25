import { ReactNode } from 'react'
import { AppQueryProvider } from '../components/query-provider'
import { appThemeCss } from '../lib/theme'

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
