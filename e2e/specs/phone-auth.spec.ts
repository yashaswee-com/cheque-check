import { expect, test } from '@playwright/test'
import messages from '../../messages/en.json'

test.describe('phone authentication UI', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
  })

  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: 'NEXT_LOCALE',
        value: 'en',
        url: test.info().project.use.baseURL!,
      },
    ])
    await page.addInitScript(() => {
      window.turnstile = {
        render: (_element, options) => {
          queueMicrotask(() => options.callback('e2e-captcha-token'))
          return 'e2e-widget'
        },
        remove: () => {},
      }
    })
    await page.route('https://challenges.cloudflare.com/**', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: '' }),
    )
    await page.goto('/login')
    const toggle = page.getByTestId('login-toggle-phone-button')
    test.skip(
      (await toggle.count()) === 0,
      'Phone authentication must be enabled in the application environment.',
    )
    await toggle.click()
    await expect(page.getByTestId('phone-auth-number-input')).toBeVisible()
  })

  test('invalid mobile numbers are rejected before requesting an OTP', async ({
    page,
  }) => {
    const requests: unknown[] = []
    await page.route('**/api/auth/phone/send', (route) => {
      requests.push(route.request().postDataJSON())
      return route.fulfill({
        json: { ok: false, status: 400, code: 'invalid_phone' },
      })
    })

    await page.getByTestId('phone-auth-number-input').fill('12345')
    await page.getByTestId('phone-auth-send-button').click()

    await expect(page.getByTestId('phone-auth-error')).toHaveText(
      messages.PhoneAuth.errors.invalid_phone,
    )
    await expect(page.getByTestId('phone-auth-number-input')).toBeFocused()
    expect(requests).toEqual([])
  })

  test('expired verification codes are cleared and can be retried', async ({
    page,
  }) => {
    await page.route('**/api/auth/phone/send', (route) =>
      route.fulfill({
        json: { ok: true, phone: '+919876543210', resendAfterSeconds: 60 },
      }),
    )
    const verifications: unknown[] = []
    await page.route('**/api/auth/phone/verify', (route) => {
      verifications.push(route.request().postDataJSON())
      return route.fulfill({
        status: 400,
        json: { ok: false, status: 400, code: 'invalid_or_expired_code' },
      })
    })

    await page.getByTestId('phone-auth-number-input').fill('9876543210')
    await page.getByTestId('phone-auth-send-button').click()
    const code = page.getByTestId('phone-auth-code-input')
    await expect(code).toBeVisible()
    await expect(page.getByTestId('phone-auth-verify-button')).toBeDisabled()
    await code.fill('123456')
    await page.getByTestId('phone-auth-verify-button').click()

    await expect(page.getByTestId('phone-auth-error')).toHaveText(
      messages.PhoneAuth.errors.invalid_or_expired_code,
    )
    await expect(code).toHaveValue('')
    await expect(code).toBeFocused()
    await expect(page.getByTestId('phone-auth-verify-button')).toBeDisabled()
    await code.fill('654321')
    await expect(page.getByTestId('phone-auth-verify-button')).toBeEnabled()
    expect(verifications).toEqual([
      { phone: '+919876543210', purpose: 'login', token: '123456' },
    ])
  })

  test('resend remains disabled until cooldown expires and requests the same number', async ({
    page,
  }) => {
    await page.clock.install()
    const sentPhones: string[] = []
    await page.route('**/api/auth/phone/send', (route) => {
      sentPhones.push(route.request().postDataJSON().phone)
      return route.fulfill({
        json: { ok: true, phone: '+919876543210', resendAfterSeconds: 60 },
      })
    })
    await page.getByTestId('phone-auth-number-input').fill('9876543210')
    await page.getByTestId('phone-auth-send-button').click()
    const resend = page.getByTestId('phone-auth-resend-button')
    await expect(resend).toBeDisabled()

    await page.clock.fastForward(59_000)
    await expect(resend).toBeDisabled()
    await page.clock.fastForward(1_100)
    await expect(resend).toBeEnabled()
    await resend.click()

    await expect(resend).toBeDisabled()
    expect(sentPhones).toEqual(['+919876543210', '+919876543210'])
  })

  test('provider failure stays on the phone form and permits retry', async ({
    page,
  }) => {
    let attempts = 0
    await page.route('**/api/auth/phone/send', (route) => {
      attempts += 1
      return attempts === 1
        ? route.fulfill({
            status: 503,
            json: { ok: false, status: 503, code: 'provider_unavailable' },
          })
        : route.fulfill({
            json: { ok: true, phone: '+919876543210', resendAfterSeconds: 60 },
          })
    })
    await page.getByTestId('phone-auth-number-input').fill('9876543210')
    await page.getByTestId('phone-auth-send-button').click()
    await expect(page.getByTestId('phone-auth-error')).toHaveText(
      messages.PhoneAuth.errors.provider_unavailable,
    )
    await expect(page.getByTestId('phone-auth-send-button')).toBeEnabled()
    await page.getByTestId('phone-auth-send-button').click()
    await expect(page.getByTestId('phone-auth-code-input')).toBeVisible()
    expect(attempts).toBe(2)
  })

  test('switching back to email removes the OTP form', async ({ page }) => {
    await page.getByTestId('phone-auth-number-input').fill('9876543210')
    await page.getByTestId('login-toggle-phone-button').click()

    await expect(page.getByTestId('login-email-input')).toBeVisible()
    await expect(page.getByTestId('login-password-input')).toBeVisible()
    await expect(page.getByTestId('phone-auth-number-input')).toHaveCount(0)
  })
})
