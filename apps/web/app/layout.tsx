import { ReactNode } from 'react'
import { AppQueryProvider } from '../components/query-provider'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <style>{`
          *, *::before, *::after { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; }
          input, textarea, select, button { font: inherit; }
        `}</style>
        <AppQueryProvider>{children}</AppQueryProvider>
      </body>
    </html>
  )
}
