import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import {
  phoneOtpSendSchema as sendSchema,
  phoneOtpVerifySchema as verifySchema,
} from '@/validators/phone-auth'
import { TABLES } from '@/lib/supabase/tables'
import {
  OTP_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  checkIndianMobile,
  normalizeOtp,
} from '@/lib/phone-auth'
import type {
  PhoneAuthErrorCode,
  PhoneAuthFailure,
  PhoneOtpSendResult,
  PhoneOtpVerifyResult,
} from '@/features/auth/phone-auth.types'

export const LINK_SEND_RATE_LIMIT = {
  endpoint: 'phone-link-send',
  limit: 5,
  windowSeconds: 3600,
} as const

const STATUS: Record<PhoneAuthErrorCode, number> = {
  invalid_request: 400,
  invalid_phone: 400,
  unsupported_country: 400,
  invalid_or_expired_code: 400,
  rate_limited: 429,
  captcha_failed: 400,
  phone_in_use: 409,
  already_linked: 409,
  unauthorized: 401,
  account_deactivated: 403,
  provider_unavailable: 503,
  unknown: 500,
}

export function failure(
  code: PhoneAuthErrorCode,
  retryAfterSeconds?: number,
): PhoneAuthFailure {
  return {
    ok: false,
    status: STATUS[code],
    code,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  }
}

interface AuthErrorLike {
  status?: number
  code?: string
  name?: string
  message?: string
}

function providerUnavailable(
  operation: string,
  error?: AuthErrorLike,
): PhoneAuthFailure {
  const providerCode =
    typeof error?.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(error.code)
      ? error.code
      : 'unknown'
  const providerStatus =
    typeof error?.status === 'number' && Number.isInteger(error.status)
      ? error.status
      : undefined

  // Provider messages can contain phone numbers or credentials; log only
  // bounded machine-readable metadata so production failures are diagnosable.
  logger.warn('Phone auth provider unavailable', {
    operation,
    code: providerCode,
    status: providerStatus,
  })
  return failure('provider_unavailable')
}

/** Maps a Supabase Auth error to a safe code; never forwards provider text. */
export function mapPhoneAuthError(
  error: AuthErrorLike,
  operation = 'auth.phone',
): PhoneAuthFailure {
  switch (error.code) {
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return failure('rate_limited', OTP_RESEND_COOLDOWN_SECONDS)
    case 'captcha_failed':
      return failure('captcha_failed')
    case 'otp_expired':
      return failure('invalid_or_expired_code')
    case 'phone_exists':
      return failure('phone_in_use')
    case 'user_banned':
      return failure('account_deactivated')
    case 'sms_send_failed':
    case 'phone_provider_disabled':
    case 'signup_disabled':
    case 'otp_disabled':
    case 'unexpected_failure':
      return providerUnavailable(operation, error)
    case 'validation_failed':
      return failure('invalid_phone')
  }
  if (error.status === 429) {
    return failure('rate_limited', OTP_RESEND_COOLDOWN_SECONDS)
  }
  if (!error.status || error.status >= 500) {
    return providerUnavailable(operation, error)
  }
  return failure('unknown')
}

function digitsOnly(phone: string | undefined | null) {
  return (phone ?? '').replace(/\D/g, '')
}

async function isProfileDeactivated(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean | 'error'> {
  const { data, error } = await supabase
    .from(TABLES.PROFILES)
    .select('deleted_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return 'error'
  return Boolean(data?.deleted_at)
}

/**
 * Sends a phone OTP through Supabase Auth. The +91 policy is enforced here and
 * again by the database trigger in 20261021050000_phone_auth.sql.
 */
export async function sendPhoneOtp(
  supabase: SupabaseClient,
  body: unknown,
): Promise<PhoneOtpSendResult> {
  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) return failure('invalid_request')
  const { purpose, captchaToken, name } = parsed.data

  const checked = checkIndianMobile(parsed.data.phone)
  if (!checked.ok) {
    return failure(
      checked.reason === 'unsupported_country'
        ? 'unsupported_country'
        : 'invalid_phone',
    )
  }
  const phone = checked.e164
  const done = {
    ok: true,
    phone,
    resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  } as const

  try {
    if (purpose !== 'link') {
      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          channel: 'sms',
          shouldCreateUser: purpose === 'signup',
          captchaToken,
          ...(name ? { data: { name } } : {}),
        },
      })
      return error ? mapPhoneAuthError(error, 'auth.phone_send') : done
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return failure('unauthorized')

    const deactivated = await isProfileDeactivated(supabase, user.id)
    if (deactivated === 'error') return failure('provider_unavailable')
    if (deactivated) return failure('account_deactivated')

    if (
      user.phone_confirmed_at &&
      digitsOnly(user.phone) === digitsOnly(phone)
    ) {
      return failure('already_linked')
    }

    const { data: allowed, error: rateError } = await supabase.rpc(
      'consume_api_rate_limit',
      {
        requested_endpoint: LINK_SEND_RATE_LIMIT.endpoint,
        request_limit: LINK_SEND_RATE_LIMIT.limit,
        window_seconds: LINK_SEND_RATE_LIMIT.windowSeconds,
      },
    )
    if (rateError) return failure('provider_unavailable')
    if (!allowed)
      return failure('rate_limited', LINK_SEND_RATE_LIMIT.windowSeconds)

    const { error } = await supabase.auth.updateUser({ phone })
    return error ? mapPhoneAuthError(error, 'auth.phone_send') : done
  } catch {
    return providerUnavailable('auth.phone_send', {
      code: 'provider_exception',
    })
  }
}

/**
 * Verifies the OTP with Supabase Auth, which issues the session (login) or
 * confirms the new login phone for the signed-in user (link). Accounts are
 * never merged; a phone owned by another user is rejected at send time.
 */
export async function verifyPhoneOtp(
  supabase: SupabaseClient,
  body: unknown,
): Promise<PhoneOtpVerifyResult> {
  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) return failure('invalid_request')
  const { purpose } = parsed.data

  const checked = checkIndianMobile(parsed.data.phone)
  if (!checked.ok) {
    return failure(
      checked.reason === 'unsupported_country'
        ? 'unsupported_country'
        : 'invalid_phone',
    )
  }
  const token = normalizeOtp(parsed.data.token)
  if (!token || token.length !== OTP_LENGTH) {
    return failure('invalid_or_expired_code')
  }
  const phone = checked.e164

  try {
    let expectedUserId: string | undefined
    if (purpose === 'link') {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()
      if (error || !user) return failure('unauthorized')
      expectedUserId = user.id
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: purpose === 'link' ? 'phone_change' : 'sms',
    })
    if (error) return mapPhoneAuthError(error, 'auth.phone_verify')

    const user = data.user
    if (!user || !data.session) return failure('provider_unavailable')

    if (expectedUserId && user.id !== expectedUserId) {
      await supabase.auth.signOut({ scope: 'local' })
      return failure('unauthorized')
    }

    const deactivated = await isProfileDeactivated(supabase, user.id)
    if (deactivated) {
      await supabase.auth.signOut({ scope: 'local' })
      return failure(
        deactivated === 'error'
          ? 'provider_unavailable'
          : 'account_deactivated',
      )
    }

    return { ok: true, phone, purpose }
  } catch {
    return providerUnavailable('auth.phone_verify', {
      code: 'provider_exception',
    })
  }
}
