'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'

export function PublicSmoothScroll() {
  const reducedMotion = useReducedMotionPreference()

  useEffect(() => {
    if (reducedMotion) return

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

    return () => lenis.destroy()
  }, [reducedMotion])

  return null
}
