import { BottomNav } from '@/components/bottom-nav'
import { TopNav } from '@/components/top-nav'
import { ScrollToTop } from '@/components/scroll-to-top'
import { OnboardingCheck } from '@/components/onboarding-check'
import { PageTransition } from '@/components/ui/page-transition'
import { AppFab } from '@/components/app-fab'
import { PinGate } from '@/features/security/components/pin-gate'
import { ClipboardGuard } from '@/features/security/components/clipboard-guard'
import {
  ShellBottomSlot,
  ShellBottomSlotProvider,
} from '@/components/shell-bottom-slot'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <OnboardingCheck>
      <ClipboardGuard />
      <PinGate>
        <ShellBottomSlotProvider>
          {/* Floating buttons rise by --shell-bottom-extra while the bottom slot is filled. */}
          <div className="flex h-full min-h-0 min-w-0 shrink-0 flex-col has-[[data-shell-bottom-slot]:not(:empty)]:[--shell-bottom-extra:3rem]">
            <ScrollToTop />
            <TopNav />
            <main
              data-page-scroll
              className="scroll-fade-y scroll-fade-4 no-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-6 pb-8 flex flex-col"
            >
              <PageTransition>{children}</PageTransition>
            </main>
            <AppFab />
            <ShellBottomSlot />
            <BottomNav />
          </div>
        </ShellBottomSlotProvider>
      </PinGate>
    </OnboardingCheck>
  )
}
