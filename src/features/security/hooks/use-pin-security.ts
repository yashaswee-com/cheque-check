'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { authService } from '@/features/auth/services/auth.service'
import { securityRepository } from '../repositories/security.repository'
import { SecurityError } from '../types'
import {
  DEFAULT_PIN_LOCK_TIMEOUT,
  type PinLockTimeout,
} from '../validators/security'
import { logger } from '@/lib/logger'
export const PIN_CHANGED_EVENT = 'chequecheck:pin-changed'
export const BACKGROUND_LOCK_MS = DEFAULT_PIN_LOCK_TIMEOUT * 1000
function announceChange() {
  window.dispatchEvent(new Event(PIN_CHANGED_EVENT))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(PIN_CHANGED_EVENT)
    channel.postMessage('changed')
    channel.close()
  }
}
export function usePinActions() {
  const client = useQueryClient()
  return {
    status: securityRepository.status,
    password: securityRepository.password,
    sendOtp: securityRepository.sendOtp,
    otp: securityRepository.otp,
    set: async (proof: string, pin: string) => {
      await securityRepository.set(proof, pin)
      announceChange()
    },
    remove: async (proof: string) => {
      await securityRepository.remove(proof)
      announceChange()
    },
    // Only refreshes the gate's timer; announcing a change would relock this session.
    timeout: async (seconds: PinLockTimeout) => {
      await securityRepository.timeout(seconds)
      await client.invalidateQueries({ queryKey: queryKeys.security.all() })
    },
  }
}
export function usePinGate() {
  const { profile, isLoading } = useProfile()
  const owner = profile?.user_id
  const router = useRouter()
  const statusQuery = useQuery({
    queryKey: queryKeys.security.status(owner),
    queryFn: securityRepository.status,
    enabled: Boolean(owner),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchInterval: 30000,
  })
  const [unlocked, setUnlocked] = useState<{
    owner: string
    revision: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const status = statusQuery.data ?? null
  const refetch = statusQuery.refetch
  const lockAfterMs =
    (status?.lockTimeoutSeconds ?? DEFAULT_PIN_LOCK_TIMEOUT) * 1000
  const refresh = async () => {
    setError(null)
    await refetch()
  }
  useEffect(() => {
    let active = true
    let backgroundAt: number | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const blur = () => {
      if (backgroundAt === null) backgroundAt = Date.now()
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (active) setUnlocked(null)
      }, lockAfterMs)
    }
    const focus = () => {
      if (document.visibilityState === 'hidden') return
      if (backgroundAt !== null && Date.now() - backgroundAt >= lockAfterMs)
        setUnlocked(null)
      backgroundAt = null
      clearTimeout(timer)
      void refetch()
    }
    const visibility = () =>
      document.visibilityState === 'hidden' ? blur() : focus()
    const changed = () => {
      setUnlocked(null)
      void refetch()
    }
    const channel =
      typeof BroadcastChannel === 'undefined'
        ? null
        : new BroadcastChannel(PIN_CHANGED_EVENT)
    if (channel) channel.onmessage = changed
    window.addEventListener('blur', blur)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener(PIN_CHANGED_EVENT, changed)
    return () => {
      active = false
      clearTimeout(timer)
      channel?.close()
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener(PIN_CHANGED_EVENT, changed)
    }
  }, [refetch, lockAfterMs])
  const signOut = async () => {
    setUnlocked(null)
    try {
      await authService.signOut()
      router.replace('/login')
    } catch (error) {
      logger.error('PIN sign out failed', error)
      setError('signout_failed')
    }
  }
  const verify = async (pin: string) => {
    if (submitting.current || !owner) return
    submitting.current = true
    setBusy(true)
    setError(null)
    try {
      const result = await securityRepository.verify(pin)
      if (result.status === 'unlocked') {
        setUnlocked({ owner, revision: result.revision })
        setRemaining(null)
      } else if (result.status === 'blocked') {
        setUnlocked(null)
        setRemaining(0)
        await signOut()
      } else if (result.status === 'incorrect') {
        setRemaining(result.remaining)
        setError('incorrect')
      } else {
        setUnlocked(null)
        setError('changed')
        await refresh()
      }
    } catch (error) {
      setUnlocked(null)
      setError(error instanceof SecurityError ? error.code : 'unavailable')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return {
    status,
    busy,
    error: error ?? (statusQuery.error ? 'unavailable' : null),
    remaining,
    refresh,
    verify,
    signOut,
    loading:
      isLoading ||
      ((!statusQuery.isFetchedAfterMount || statusQuery.isPending) &&
        !statusQuery.error),
    canEnter: Boolean(
      owner &&
      status &&
      statusQuery.isFetchedAfterMount &&
      !status.blocked &&
      !error &&
      !statusQuery.isError &&
      (!status.enabled ||
        (unlocked?.owner === owner && unlocked.revision === status.revision)),
    ),
  }
}
