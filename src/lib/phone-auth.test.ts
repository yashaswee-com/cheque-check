import { describe, expect, it } from 'vitest'
import {
  checkIndianMobile,
  isIndianMobileE164,
  maskPhone,
  normalizeOtp,
} from './phone-auth'

describe('phone-auth helpers', () => {
  it.each(['9876543210', '+91 98765 43210', '919876543210', '09876543210'])(
    'accepts %s',
    (input) => {
      expect(checkIndianMobile(input)).toMatchObject({
        ok: true,
        e164: '+919876543210',
      })
    },
  )

  it('rejects other countries and invalid numbers', () => {
    expect(checkIndianMobile('+14155550123')).toMatchObject({ ok: false })
    expect(checkIndianMobile('1234567890')).toMatchObject({ ok: false })
    expect(checkIndianMobile('')).toMatchObject({ ok: false })
  })

  it('validates E.164 and OTP', () => {
    expect(isIndianMobileE164('+919876543210')).toBe(true)
    expect(isIndianMobileE164('+14155550123')).toBe(false)
    expect(normalizeOtp('123 456')).toBe('123456')
    expect(normalizeOtp('abc')).toBeNull()
  })

  it('masks the middle digits', () => {
    expect(maskPhone('+919876543210')).not.toContain('98765')
    expect(maskPhone('+919876543210')).toBe('+91 98•••••210')
  })
})
