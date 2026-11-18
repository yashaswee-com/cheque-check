'use client'

import { useState, type ReactNode, type SVGProps } from 'react'
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from 'framer-motion'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

// Adapted from Aceternity UI's sticky banner (https://ui.aceternity.com/components/sticky-banner).
export const StickyBanner = ({
  className,
  children,
  hideOnScroll = false,
  closeLabel = 'Dismiss banner',
}: {
  className?: string
  children: ReactNode
  hideOnScroll?: boolean
  closeLabel?: string
}) => {
  const [dismissed, setDismissed] = useState(false)
  const [scrolledAway, setScrolledAway] = useState(false)
  const reducedMotion = useReducedMotionPreference()
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setScrolledAway(hideOnScroll && latest > 40)
  })

  const transition = {
    duration: reducedMotion ? 0 : 0.3,
    ease: 'easeInOut' as const,
  }

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          className={cn(
            'sticky inset-x-0 top-0 z-40 flex min-h-14 w-full items-center justify-center bg-transparent px-4 py-1',
            className,
          )}
          initial={reducedMotion ? false : { y: -100, opacity: 0 }}
          animate={{
            y: scrolledAway ? -100 : 0,
            opacity: scrolledAway ? 0 : 1,
          }}
          exit={{ height: 0, minHeight: 0, opacity: 0, paddingBlock: 0 }}
          transition={transition}
          aria-hidden={scrolledAway || undefined}
          inert={scrolledAway || undefined}
        >
          {children}
          <button
            type="button"
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            onClick={() => setDismissed(true)}
            aria-label={closeLabel}
          >
            <CloseIcon className="size-5" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </svg>
)
