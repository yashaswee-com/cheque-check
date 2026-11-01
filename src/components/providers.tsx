'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BusinessProvider } from '@/features/businesses/hooks/use-business'
import { ProfileProvider } from '@/features/profile/hooks/use-profile'
import { CelebrationHost } from '@/components/celebration-host'
import { MonitoringProvider } from '@/components/monitoring-provider'
import { PremiumPromptProvider } from '@/features/monetization/components/premium-prompt'

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <BusinessProvider>
          <PremiumPromptProvider>
            <MonitoringProvider />
            {children}
            <CelebrationHost />
          </PremiumPromptProvider>
        </BusinessProvider>
      </ProfileProvider>
    </QueryClientProvider>
  )
}
