'use client'

import { useEffect, useRef } from 'react'

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string
      action?: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ): string
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID)
    const script = existing ?? document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('turnstile')), {
      once: true,
    })
    if (!existing) {
      script.id = SCRIPT_ID
      ;(script as HTMLScriptElement).src = SCRIPT_SRC
      ;(script as HTMLScriptElement).async = true
      document.head.appendChild(script)
    }
  })
}

interface TurnstileWidgetProps {
  siteKey: string
  /** Turnstile action (1-32 chars of [A-Za-z0-9_-]); reported in Turnstile analytics and siteverify. */
  action?: string
  onToken: (token: string | null) => void
}

/** Renders the Cloudflare Turnstile challenge; tokens are single-use, so remount to reset. */
export function TurnstileWidget({
  siteKey,
  action,
  onToken,
}: TurnstileWidgetProps) {
  const container = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let widgetId: string | undefined
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widgetId = window.turnstile.render(container.current, {
          sitekey: siteKey,
          ...(action ? { action } : {}),
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey, action])

  return <div ref={container} data-testid="turnstile-widget" />
}
