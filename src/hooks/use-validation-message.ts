'use client'

import { useLocale, useTranslations } from 'next-intl'
import { logger } from '@/lib/logger'

export const VALIDATION_MESSAGES: Record<string, string> = {
  'Enter a valid phone number': 'phone',
  'Business name is required': 'businessName',
  'Enter a valid email address': 'email',
  'Invalid email address': 'email',
  'Party name is required': 'partyName',
  'Contact number is required': 'contact',
  'Bank is required': 'bank',
  'Account holder name is required': 'accountName',
  'Account number is required': 'accountNumber',
  'Enter a valid 11-character IFSC code': 'ifsc',
  'Enter a valid opening balance': 'openingBalance',
  'Cheque number is required': 'chequeNumber',
  'Cheque number must be exactly 6 digits': 'chequeDigits',
  'Amount must be positive': 'amount',
  'Cheque date is required': 'chequeDate',
  'Expected deposit date is required': 'depositDate',
  'Party is required': 'party',
  'Account is required': 'account',
  'Invalid input: expected number, received NaN': 'invalidValue',
  'Invalid input: expected number, received string': 'invalidValue',
  'Invalid input: expected number, received number': 'invalidValue',
}

export function useValidationMessage() {
  const t = useTranslations('Validation')
  const locale = useLocale()
  return (message?: string) => {
    if (!message) return ''
    const key = VALIDATION_MESSAGES[message]
    if (key) return t(key)
    if (locale === 'en') return message
    logger.warn(
      'Unmapped validation message; showing localized invalid-value message',
    )
    return t('invalidValue')
  }
}
