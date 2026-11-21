'use client'

import { useEffect } from 'react'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'

export function PublicSmoothScroll() {
  const reducedMotion = useReducedMotionPreference()

  useEffect(() => {
    if (reducedMotion) return

    let active = true
    let destroy: (() => void) | undefined
    const start = async () => {
      window.removeEventListener('wheel', start)
      window.removeEventListener('touchmove', start)
      const { default: Lenis } = await import('lenis')
      if (!active) return
      const lenis = new Lenis({
        autoRaf: true,
        lerp: 0.16,
        smoothWheel: true,
        syncTouch: true,
        syncTouchLerp: 0.1,
        touchInertiaExponent: 1.4,
        touchMultiplier: 0.95,
        wheelMultiplier: 0.9,
        prevent: (node) =>
          Boolean(
            node.closest(
              'input, textarea, select, [contenteditable="true"], [role="dialog"], [data-lenis-prevent], [data-slot="pill-scroller"]',
            ),
          ),
      })
      destroy = () => lenis.destroy()
    }

    window.addEventListener('wheel', start, { once: true, passive: true })
    window.addEventListener('touchmove', start, { once: true, passive: true })
    return () => {
      active = false
      destroy?.()
      window.removeEventListener('wheel', start)
      window.removeEventListener('touchmove', start)
    }
  }, [reducedMotion])

  return null
}
