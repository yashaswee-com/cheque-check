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
        <div className="flex h-full min-h-0 min-w-0 shrink-0 flex-col">
          <ScrollToTop />
          <TopNav />
          <main
            data-page-scroll
            className="scroll-fade-y scroll-fade-4 no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-8 flex flex-col"
          >
            <PageTransition>{children}</PageTransition>
          </main>
          <AppFab />
          <BottomNav />
        </div>
      </PinGate>
    </OnboardingCheck>
  )
}
