import { cleanup, renderHook } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import english from '../../messages/en.json'
import hindi from '../../messages/hi.json'
import hinglish from '../../messages/hi-en.json'
import {
  VALIDATION_MESSAGES,
  useValidationMessage,
} from './use-validation-message'
import {
  accountSchema,
  businessSchema,
  chequeSchema,
  partySchema,
} from '@/validators'
import { logger } from '@/lib/logger'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const catalogs = { en: english, hi: hindi, 'hi-en': hinglish }

describe('localized form validation', () => {
  it.each(['en', 'hi', 'hi-en'] as const)(
    'translates every validator message in %s',
    (locale) => {
      const { result } = renderHook(useValidationMessage, {
        wrapper: ({ children }) => (
          <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
            {children}
          </NextIntlClientProvider>
        ),
      })
      for (const [message, key] of Object.entries(VALIDATION_MESSAGES)) {
        expect(result.current(message)).toBe(
          catalogs[locale].Validation[key as keyof typeof english.Validation],
        )
      }
      expect(result.current(undefined)).toBe('')
    },
  )

  it('covers all custom messages surfaced by invalid entity forms', () => {
    for (const schema of [
      accountSchema,
      businessSchema,
      chequeSchema,
      partySchema,
    ]) {
      const parsed = schema.safeParse({
        name: '',
        contact: '',
        email: 'invalid',
        phone: 'invalid',
        bank_id: '',
        account_name: '',
        account_number: '',
        ifsc_code: 'wrong',
        opening_balance: NaN,
        cheque_number: '',
        amount: 0,
        cheque_date: '',
        deposit_date: '',
        party_id: '',
        account_id: '',
        type: 'Outward',
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          expect(VALIDATION_MESSAGES, issue.message).toHaveProperty(
            issue.message,
          )
        }
      }
    }
  })

  it('surfaces an explicit localized fallback and logs unknown messages without user values', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { result } = renderHook(useValidationMessage, {
      wrapper: ({ children }) => (
        <NextIntlClientProvider locale="hi" messages={hindi}>
          {children}
        </NextIntlClientProvider>
      ),
    })
    expect(result.current('Unexpected validator message')).toBe(
      hindi.Validation.invalidValue,
    )
    expect(warn).toHaveBeenCalledWith(
      'Unmapped validation message; showing localized invalid-value message',
    )
  })
})
