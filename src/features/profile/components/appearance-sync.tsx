'use client'
import { useEffect } from 'react'
import { useProfile } from '../hooks/use-profile'
import {
  applyAppearance,
  persistAppearance,
  storedAppearance,
} from '../lib/appearance'
export function AppearanceSync() {
  const { profile } = useProfile()
  useEffect(() => {
    const appearance = profile?.appearance ?? storedAppearance()
    persistAppearance(appearance)
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const refresh = () => applyAppearance(appearance)
    media?.addEventListener('change', refresh)
    return () => media?.removeEventListener('change', refresh)
  }, [profile?.user_id, profile?.appearance])
  return null
}
