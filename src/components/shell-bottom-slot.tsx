'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

const SlotContext = createContext<{
  slot: HTMLElement | null
  register: (node: HTMLElement | null) => void
} | null>(null)

/** Shares the shell's bottom slot (between page content and bottom nav). */
export function ShellBottomSlotProvider({ children }: { children: ReactNode }) {
  const [slot, register] = useState<HTMLElement | null>(null)
  return (
    <SlotContext.Provider value={{ slot, register }}>
      {children}
    </SlotContext.Provider>
  )
}

/**
 * Fixed-height dock directly above the bottom nav. Outside the scroll area so
 * the page scroll fade never masks what is portalled here.
 */
export function ShellBottomSlot() {
  const context = useContext(SlotContext)
  return (
    <div
      ref={context?.register}
      data-shell-bottom-slot
      data-testid="shell-bottom-slot"
      className="relative z-30 w-full shrink-0 empty:hidden"
    />
  )
}

export function useShellBottomSlot() {
  return useContext(SlotContext)?.slot ?? null
}
