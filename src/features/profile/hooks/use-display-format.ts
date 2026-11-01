'use client'

import { createContext, useContext } from 'react'
import { useLocale } from 'next-intl'
import {
  createPreferenceFormatter,
  type FormattingPreferences,
} from '@/lib/preference-format'

export const FormattingContext = createContext<FormattingPreferences | null>(
  null,
)

export function useFormattingPreferences() {
  return useContext(FormattingContext)
}

export function useDisplayFormat(preferences?: FormattingPreferences | null) {
  const saved = useFormattingPreferences()
  const locale = useLocale()
  return createPreferenceFormatter(
    preferences === undefined ? saved : preferences,
    locale,
  )
}
