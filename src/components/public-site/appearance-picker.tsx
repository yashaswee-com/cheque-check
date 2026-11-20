'use client'

import { PaintBoardIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import {
  persistAppearance,
  type Appearance,
} from '@/features/profile/lib/appearance'
import styles from './landing.module.css'

const APPEARANCE_EVENT = 'chequecheck:appearance'
const serverAppearance = () => 'system' as const
const currentAppearance = (): Appearance => {
  const value = document.documentElement.dataset.appearance
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

function subscribeToAppearance(onChange: () => void) {
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
  const handleSystemChange = () => {
    if (currentAppearance() === 'system') persistAppearance('system')
    onChange()
  }
  window.addEventListener(APPEARANCE_EVENT, onChange)
  media?.addEventListener('change', handleSystemChange)
  return () => {
    window.removeEventListener(APPEARANCE_EVENT, onChange)
    media?.removeEventListener('change', handleSystemChange)
  }
}

export function AppearancePicker() {
  const t = useTranslations('Appearance')
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    currentAppearance,
    serverAppearance,
  )

  return (
    <div className={styles.appearancePicker}>
      <HugeiconsIcon icon={PaintBoardIcon} size={17} aria-hidden="true" />
      <select
        aria-label={t('title')}
        value={appearance}
        onChange={(event) => {
          const next = event.target.value as Appearance
          persistAppearance(next)
          window.dispatchEvent(new Event(APPEARANCE_EVENT))
        }}
      >
        {(['light', 'dark', 'system'] as const).map((value) => (
          <option key={value} value={value}>
            {t(value)}
          </option>
        ))}
      </select>
    </div>
  )
}
