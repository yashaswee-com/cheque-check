'use client'

import { marketingEnabled } from '@/features/analytics/contracts'
import { openCookieSettings } from '@/features/analytics/consent-store'

export function CookieSettingsButton({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  if (!marketingEnabled()) return null
  return (
    <button
      type="button"
      onClick={openCookieSettings}
      className={className ?? 'underline underline-offset-2'}
      data-testid="footer-cookie-settings"
    >
      {label}
    </button>
  )
}
