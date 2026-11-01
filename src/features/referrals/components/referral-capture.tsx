'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  preserveReferralLink,
  useReferralLink,
} from '../hooks/use-referral-link'
export function ReferralCapture() {
  const pathname = usePathname()
  const t = useTranslations('Referrals')
  const { error } = useReferralLink()
  useEffect(() => {
    preserveReferralLink()
  }, [pathname])
  return error ? (
    <p role="alert" className="p-4">
      {t('invalid')}
    </p>
  ) : null
}
