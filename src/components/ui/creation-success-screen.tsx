'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { celebrate } from '@/lib/celebrate'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon as ArrowRight } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface CreationSuccessScreenProps {
  title?: string
  description: string
  ctaLabel: string
  onContinue: () => void
  continueTestId?: string
}
const subscribe = () => () => {}

// Shared "entity created" screen used by cheque/party/account/business creation
// flows, mirroring the onboarding completion step's icon/motion treatment.
export function CreationSuccessScreen({
  title,
  description,
  ctaLabel,
  onContinue,
  continueTestId = 'creation-success-continue',
}: CreationSuccessScreenProps) {
  const reduced = useReducedMotionPreference()
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  const celebrated = useRef(false)
  useEffect(() => {
    if (celebrated.current) return
    celebrated.current = true
    celebrate()
  }, [])
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center space-y-10 py-12 text-center"
    >
      <div className="relative size-28">
        {mounted && (
          <>
            <motion.div
              initial={reduced ? false : { scale: 0.85, rotate: -4 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                damping: 22,
                stiffness: 180,
                delay: 0.15,
              }}
              className="flex h-28 w-28 items-center justify-center rounded-full bg-green-600 text-white"
            >
              <svg
                viewBox="0 0 48 48"
                fill="none"
                stroke="white"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-14"
                aria-hidden="true"
                data-testid="success-tick"
              >
                <motion.path
                  d="M10 25L20 35L39 14"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{
                    ease: 'easeInOut',
                    duration: reduced ? 0 : 0.5,
                    delay: reduced ? 0 : 0.25,
                  }}
                />
              </svg>
            </motion.div>
            <motion.div
              animate={
                reduced
                  ? { opacity: 0 }
                  : { scale: [1, 1.12], opacity: [0.15, 0] }
              }
              transition={{
                duration: reduced ? 0 : 1.5,
                ease: 'easeOut',
              }}
              className="absolute inset-0 -z-10 rounded-full bg-green-600"
            />
          </>
        )}
      </div>

      <div className="space-y-3">
        {title && (
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        )}
        <p className="mx-auto max-w-[18rem] px-6 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>

      <Button
        onClick={onContinue}
        data-testid={continueTestId}
        className="h-14 w-full max-w-sm rounded-full text-lg font-semibold transition-all hover:scale-105 active:scale-95"
      >
        {ctaLabel}
        <HugeiconsIcon icon={ArrowRight} className="ml-2 h-5 w-5" />
      </Button>
    </motion.div>
  )
}
