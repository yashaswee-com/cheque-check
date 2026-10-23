import { isValidE164Phone } from '@/lib/phone'

export const PHONE_AUTH_COUNTRY_CODE = '+91'
export const OTP_LENGTH = 6
export const OTP_RESEND_COOLDOWN_SECONDS = 60

export type PhoneAuthPurpose = 'login' | 'link'

export type PhoneNumberCheck =
  | { ok: true; e164: string }
  | { ok: false; reason: 'invalid' | 'unsupported_country' }

const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/

/**
 * Normalises user input to +91 E.164. Accepts 10-digit national numbers, a
 * leading 0, and 91/+91 prefixes; any other country code is rejected.
 */
export function checkIndianMobile(input: string): PhoneNumberCheck {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, reason: 'invalid' }
  if (/[^\d+\s\-().]/.test(trimmed)) return { ok: false, reason: 'invalid' }

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  let national: string
  if (hasPlus) {
    if (!digits.startsWith('91')) {
      return { ok: false, reason: 'unsupported_country' }
    }
    national = digits.slice(2)
  } else if (digits.length === 12 && digits.startsWith('91')) {
    national = digits.slice(2)
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = digits.slice(1)
  } else {
    national = digits
  }

  const e164 = `${PHONE_AUTH_COUNTRY_CODE}${national}`
  if (!INDIAN_MOBILE.test(e164) || !isValidE164Phone(e164)) {
    return { ok: false, reason: 'invalid' }
  }
  return { ok: true, e164 }
}

export function isIndianMobileE164(value: string): boolean {
  return INDIAN_MOBILE.test(value) && isValidE164Phone(value)
}

/** Returns the OTP only when it is exactly OTP_LENGTH digits. */
export function normalizeOtp(input: string): string | null {
  const digits = input.replace(/\s/g, '')
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits) ? digits : null
}

/** +91 98•••••210 style label that never exposes the full number. */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return e164
  return `${e164.slice(0, 3)} ${e164.slice(3, 5)}•••••${e164.slice(-3)}`
}
