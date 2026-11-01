import { useSyncExternalStore } from 'react'
import { referralCodeSchema } from '@/validators/referral'
import { logger } from '@/lib/logger'

const key = 'chequecheck-referral'
const event = 'referral-link-change'
let storageFailed = false
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(event, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(event, callback)
  }
}
function snapshot() {
  if (storageFailed) return '!error'
  try {
    const value =
      new URLSearchParams(window.location.search).get('ref') ??
      localStorage.getItem(key)
    if (!value) return ''
    const parsed = referralCodeSchema.safeParse(value)
    return parsed.success ? parsed.data : '!error'
  } catch (error) {
    logger.error('Referral link could not be read', error)
    return '!error'
  }
}
export function preserveReferralLink() {
  const value = new URLSearchParams(window.location.search).get('ref')
  if (!value) return
  const parsed = referralCodeSchema.safeParse(value)
  if (!parsed.success) return
  try {
    localStorage.setItem(key, parsed.data)
    storageFailed = false
  } catch (error) {
    logger.error('Referral link could not be preserved', error)
    storageFailed = true
  }
  window.dispatchEvent(new Event(event))
}
export function clearReferralLink() {
  localStorage.removeItem(key)
  storageFailed = false
  window.dispatchEvent(new Event(event))
}
export function useReferralLink() {
  const code = useSyncExternalStore(subscribe, snapshot, () => '')
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  )
  return {
    code: code === '!error' ? '' : code,
    error: code === '!error',
    origin,
  }
}
