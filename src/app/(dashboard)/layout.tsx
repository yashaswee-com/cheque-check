import { BottomNav } from '@/components/bottom-nav'
import { TopNav } from '@/components/top-nav'
import { ScrollToTop } from '@/components/scroll-to-top'
import { OnboardingCheck } from '@/components/onboarding-check'
import { PageTransition } from '@/components/ui/page-transition'
import { AppFab } from '@/components/app-fab'
import { PinGate } from '@/features/security/components/pin-gate'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OnboardingCheck>
      <PinGate>
        <div className="flex min-h-full min-w-0 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <ScrollToTop />
          <TopNav />
          <main className="min-w-0 flex-1 px-4 pt-6 flex flex-col">
            <PageTransition>{children}</PageTransition>
          </main>
          <AppFab />
          <BottomNav />
        </div>
      </PinGate>
    </OnboardingCheck>
  )
}
