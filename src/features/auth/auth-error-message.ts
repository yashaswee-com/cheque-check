export function getAuthErrorMessageKey(error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined

  switch (code) {
    case 'invalid_credentials':
    case 'invalid_login_credentials':
      return 'errors.invalidCredentials'
    case 'email_not_confirmed':
      return 'errors.emailNotConfirmed'
    case 'email_exists':
    case 'user_already_exists':
      return 'errors.accountExists'
    case 'weak_password':
      return 'errors.weakPassword'
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'errors.rateLimited'
    case 'captcha_failed':
      return 'errors.captchaFailed'
    case 'provider_disabled':
    case 'signup_disabled':
      return 'errors.methodUnavailable'
    case 'user_banned':
      return 'errors.accountDeactivated'
    default:
      return 'errors.unavailable'
  }
}
