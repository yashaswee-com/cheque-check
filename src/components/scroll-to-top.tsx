'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ScrollToTop() {
  const pathname = usePathname()

  useEffect(() => {
    const scroller =
      document.querySelector<HTMLElement>('[data-page-scroll]') ??
      document.getElementById('app-scroll-container')
    if (scroller) {
      scroller.scrollTo({ top: 0, left: 0 })
      return
    }
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
