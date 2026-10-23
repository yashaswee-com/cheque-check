'use client'

import { useEffect, useState } from 'react'
import { isKeyboardViewport } from '@/lib/navigation-routes'

export function useSoftwareKeyboard() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let baseline = Math.max(viewport.height, window.innerHeight)
    const update = () => {
      const active = document.activeElement
      const editable =
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === 'TEXTAREA' ||
          (active instanceof HTMLInputElement &&
            ![
              'button',
              'checkbox',
              'radio',
              'range',
              'submit',
              'file',
            ].includes(active.type)))
      if (!editable && viewport.scale === 1)
        baseline = Math.max(viewport.height, window.innerHeight)
      setOpen(
        isKeyboardViewport({
          editable,
          height: viewport.height,
          baseline,
          scale: viewport.scale,
        }),
      )
    }
    const orientation = () => {
      baseline = window.innerHeight
      update()
    }
    viewport.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    window.addEventListener('orientationchange', orientation)
    return () => {
      viewport.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      window.removeEventListener('orientationchange', orientation)
    }
  }, [])
  return open
}
