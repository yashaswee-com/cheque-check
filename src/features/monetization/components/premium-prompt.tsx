'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { PremiumFeature, PremiumState } from '../lib/premium-access'
import { PremiumModal } from './premium-modal'

type PremiumPrompt = {
  feature: PremiumFeature
  state: PremiumState
}

const PremiumPromptContext = createContext<
  ((prompt: PremiumPrompt) => void) | null
>(null)

export function PremiumPromptProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<PremiumPrompt | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <PremiumPromptContext.Provider
      value={(next) => {
        setPrompt(next)
        setOpen(true)
      }}
    >
      {children}
      {prompt && (
        <PremiumModal
          open={open}
          onOpenChange={setOpen}
          feature={prompt.feature}
          accessState={prompt.state}
        />
      )}
    </PremiumPromptContext.Provider>
  )
}

export function usePremiumPrompt() {
  const prompt = useContext(PremiumPromptContext)
  if (!prompt) {
    throw new Error('Premium controls require PremiumPromptProvider')
  }
  return prompt
}
