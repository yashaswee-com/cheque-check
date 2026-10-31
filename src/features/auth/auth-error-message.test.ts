import { describe, expect, it } from 'vitest'
import { getAuthErrorMessageKey } from './auth-error-message'

describe('getAuthErrorMessageKey', () => {
  it.each([
    ['invalid_credentials', 'invalidCredentials'],
    ['invalid_login_credentials', 'invalidCredentials'],
    ['email_not_confirmed', 'emailNotConfirmed'],
    ['email_exists', 'accountExists'],
    ['user_already_exists', 'accountExists'],
    ['weak_password', 'weakPassword'],
    ['over_request_rate_limit', 'rateLimited'],
    ['over_email_send_rate_limit', 'rateLimited'],
    ['captcha_failed', 'captchaFailed'],
    ['provider_disabled', 'methodUnavailable'],
    ['signup_disabled', 'methodUnavailable'],
    ['user_banned', 'accountDeactivated'],
  ])('maps %s to actionable localized guidance', (code, message) => {
    expect(getAuthErrorMessageKey({ code })).toBe(`errors.${message}`)
  })

  it.each([
    null,
    undefined,
    'raw provider error',
    new Error('private details'),
    { code: 123 },
    { code: 'unexpected' },
  ])('uses safe guidance for unrecognized errors: %s', (error) => {
    expect(getAuthErrorMessageKey(error)).toBe('errors.unavailable')
  })
})
