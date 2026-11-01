'use client'

import { useTranslations } from 'next-intl'
import { TIME_FORMAT_OPTIONS } from '../lib/preference-options'

export function useTimeFormatOptions() {
  const t = useTranslations('Onboarding')
  return TIME_FORMAT_OPTIONS.map(({ value }) => ({
    value,
    label: t(`time${value}`),
  }))
}
