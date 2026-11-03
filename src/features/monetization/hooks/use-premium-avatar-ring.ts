'use client'

import { usePremiumAccess } from './use-premium-access'

/** Gold ring drawn with box-shadow, so it never shifts avatar layout. */
export const PREMIUM_AVATAR_RING_CLASS =
  'ring-[3px] ring-[#D4AF37] ring-offset-2 ring-offset-background'

/** Ring classes for the signed-in user's own photo while premium is active. */
export function usePremiumAvatarRing() {
  const { hasAccess } = usePremiumAccess()
  return hasAccess ? PREMIUM_AVATAR_RING_CLASS : undefined
}
