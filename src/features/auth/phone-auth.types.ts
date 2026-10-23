import type { PhoneAuthPurpose } from '@/lib/phone-auth'

export type PhoneAuthErrorCode =
  | 'invalid_request'
  | 'invalid_phone'
  | 'unsupported_country'
  | 'invalid_or_expired_code'
  | 'rate_limited'
  | 'captcha_failed'
  | 'phone_in_use'
  | 'already_linked'
  | 'unauthorized'
  | 'account_deactivated'
  | 'provider_unavailable'
  | 'unknown'

export interface PhoneAuthFailure {
  ok: false
  status: number
  code: PhoneAuthErrorCode
  retryAfterSeconds?: number
}

export interface PhoneOtpSendInput {
  phone: string
  purpose: PhoneAuthPurpose
  captchaToken?: string
}

export interface PhoneOtpVerifyInput {
  phone: string
  token: string
  purpose: PhoneAuthPurpose
}

export type PhoneOtpSendResult =
  { ok: true; phone: string; resendAfterSeconds: number } | PhoneAuthFailure

export type PhoneOtpVerifyResult =
  { ok: true; phone: string; purpose: PhoneAuthPurpose } | PhoneAuthFailure
