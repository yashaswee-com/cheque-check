'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { premiumWorkspaceService } from '../service'

const fragmentDestinations: Record<string, string> = {
  'bulk-import': '/cheques#bulk-import',
  'cheque-templates': '/cheques#cheque-templates',
  'bulk-actions': '/cheques#bulk-actions',
  'saved-views': '/cheques#saved-views',
  'party-statements': '/parties#party-statements',
  'consolidated-dashboard': '/businesses#consolidated-dashboard',
  'message-templates': '/businesses#message-templates',
}

export function PremiumCompatibilityRedirect() {
  const t = useTranslations('NativeTools')
  const router = useRouter()
  const { activeBusiness, businesses, isLoading, setActiveBusiness } =
    useBusiness()
  const activeBusinessId = activeBusiness?.id
  const started = useRef(false)
  const setBusiness = useRef(setActiveBusiness)

  useEffect(() => {
    setBusiness.current = setActiveBusiness
  }, [setActiveBusiness])

  useEffect(() => {
    if (isLoading || started.current) return
    started.current = true
    let cancelled = false
    const fragment = window.location.hash.slice(1)
    const partyId = new URLSearchParams(window.location.search).get('partyId')

    const redirect = async () => {
      if (fragment === 'party-statements' && partyId) {
        for (const business of businesses) {
          try {
            const context = await premiumWorkspaceService.context(business.id)
            if (!context.parties.some((party) => party.id === partyId)) continue
            if (cancelled) return
            setBusiness.current(business)
            router.replace(
              `/parties/${encodeURIComponent(partyId)}#party-statements`,
            )
            return
          } catch {
            continue
          }
        }
      }

      if (cancelled) return
      const destination =
        fragmentDestinations[fragment] ?? '/cheques#bulk-import'
      if (fragment === 'message-templates' && activeBusinessId) {
        router.replace(
          `/businesses/${encodeURIComponent(activeBusinessId)}#message-templates`,
        )
        return
      }
      router.replace(destination)
    }

    void redirect()
    return () => {
      cancelled = true
      started.current = false
    }
  }, [activeBusinessId, businesses, isLoading, router])

  return <p role="status">{t('loading')}</p>
}
