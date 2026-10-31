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
    await expect(page.locator('[data-slot="toast-title"]')).toHaveText(
      messages.PhoneAuth.errorTitle,
    )
    await expect(page.locator('[data-slot="toast-description"]')).toHaveText(
      messages.PhoneAuth.errors.invalid_phone,
    )
    await expect(page.getByTestId('phone-auth-number-input')).toBeFocused()
    expect(requests).toEqual([])
  })

  test('six OTP slots support keyboard editing and match the mobile field width', async ({
    page,
  }) => {
    const numberField = page.getByTestId('phone-auth-number-field')
    for (const width of [320, 360, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      const numberBounds = await numberField.boundingBox()
      expect(numberBounds).not.toBeNull()
      expect(numberBounds!.width).toBeGreaterThanOrEqual(300)
      const widget = page.getByTestId('turnstile-widget')
      if (await widget.count()) {
        const captchaBounds = await widget.boundingBox()
        expect(captchaBounds).not.toBeNull()
        expect(captchaBounds!.x).toBeCloseTo(numberBounds!.x, 0)
        expect(captchaBounds!.width).toBeCloseTo(numberBounds!.width, 0)
      }
    }
    await page.setViewportSize({ width: 320, height: 900 })
    await page.route('**/api/auth/phone/send', (route) =>
      route.fulfill({
        json: { ok: true, phone: '+919876543210', resendAfterSeconds: 60 },
      }),
    )
    await page.getByTestId('phone-auth-number-input').fill('9876543210')
    await page.getByTestId('phone-auth-send-button').click()
    const input = page.getByTestId('phone-auth-code-input')
    const slots = page.getByTestId('phone-auth-code-slots')
    await expect(slots.locator('[data-slot="otp-slot"]')).toHaveCount(6)
    await input.fill('123456')
    await expect(slots).toHaveText('123456')
    await expect(page.getByTestId('phone-auth-verify-button')).toBeEnabled()
    await input.press('End')
    await input.press('Backspace')
    await expect(input).toHaveValue('12345')
    await expect(page.getByTestId('phone-auth-verify-button')).toBeDisabled()
    await input.press('9')
    await expect(slots).toHaveText('123459')
  })

  test('login and signup secondary buttons share social button styling on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    for (const kind of ['login', 'signup']) {
      await page.goto(`/${kind}`)
      await expect(page.getByTestId('phone-auth-number-input')).toBeVisible()
      const toggle = page.getByTestId(`${kind}-toggle-phone-button`)
      await expect(toggle.locator('svg')).toHaveCount(1)
      const styling = await page
        .getByRole('button', { name: /Use email instead|^Google$|^Facebook$/ })
        .evaluateAll((elements) =>
          elements.map((element) => ({
            height: element.getBoundingClientRect().height,
            radius: getComputedStyle(element).borderRadius,
            weight: getComputedStyle(element).fontWeight,
          })),
        )
      expect(styling).toHaveLength(3)
      expect(styling[0]).toEqual(styling[1])
      expect(styling[0]).toEqual(styling[2])
      expect(styling[0].height).toBe(48)
    }
  })

  test('email login and signup failures show actionable toasts without browser alerts', async ({
    page,
  }) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.dismiss()
    })
    await page.route('**/auth/v1/token**', (route) =>
      route.fulfill({
        status: 400,
        headers: {
          'X-Supabase-Api-Version': '2024-01-01',
          'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
        },
        json: { code: 'invalid_credentials', message: 'Invalid credentials' },
      }),
    )
    await page.route('**/auth/v1/signup**', (route) =>
      route.fulfill({
        status: 422,
        headers: {
          'X-Supabase-Api-Version': '2024-01-01',
          'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
        },
        json: { code: 'weak_password', message: 'Password is too weak' },
      }),
    )
    for (const kind of ['login', 'signup']) {
      await page.goto(`/${kind}`)
      await page.getByTestId(`${kind}-toggle-phone-button`).click()
      if (kind === 'signup') {
        await page.getByTestId('signup-name-input').fill('Test Person')
      }
      await page.getByTestId(`${kind}-email-input`).fill('test@example.test')
      await page.getByTestId(`${kind}-password-input`).fill('test-password')
      await page.getByTestId(`${kind}-submit-button`).click()
      await expect(page.locator('[data-slot="toast-description"]')).toHaveText(
        kind === 'login'
          ? messages.Auth.errors.invalidCredentials
          : messages.Auth.errors.weakPassword,
      )
      await expect(page).toHaveURL(`/${kind}`)
    }
    expect(dialogs).toEqual([])
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
