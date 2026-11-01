'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { celebrate } from '@/lib/celebrate'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon as ArrowRight } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

interface CreationSuccessScreenProps {
  title: string
  description: string
  ctaLabel: string
  onContinue: () => void
  continueTestId?: string
}

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
  const celebrated = useRef(false)
  useEffect(() => {
    if (celebrated.current) return
    celebrated.current = true
    celebrate()
  }, [])
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center space-y-10 py-12 text-center"
    >
      <div className="relative">
        <motion.div
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            damping: 12,
            stiffness: 200,
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
              : { scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0] }
          }
          transition={{ duration: reduced ? 0 : 1.5 }}
          className="absolute inset-0 -z-10 rounded-full bg-green-600"
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
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
