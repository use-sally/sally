'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode, Suspense, useState } from 'react'
import { AuthGate } from './auth-gate'

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={children}>
        <AuthGate>{children}</AuthGate>
      </Suspense>
    </QueryClientProvider>
  )
}
