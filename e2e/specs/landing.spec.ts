import { expect, test } from '@playwright/test'

const protectedPaths = [
  '/dashboard',
  '/cheques/00000000-0000-4000-8000-000000000000',
  '/settings/preferences',
  '/reports',
]

test.describe('public landing page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a visitor reaches login and signup from the landing page', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'ChequeCheck' }),
    ).toBeVisible()

    // Landing CTAs are links styled as buttons and expose the button role.
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page).toHaveURL('/login')
    await expect(page.getByTestId('login-email-input')).toBeVisible()

    await page.goBack()
    await page.getByRole('button', { name: 'Sign up' }).click()
    await expect(page).toHaveURL('/signup')
    await expect(page.getByTestId('signup-email-input')).toBeVisible()
  })

  test('a visitor following a protected link is sent to login', async ({
    page,
  }) => {
    for (const path of protectedPaths) {
      await page.goto(path)
      await expect(page).toHaveURL('/login')
    }
  })
})

// Uses the shared authenticated + onboarded session from global.setup.ts.
test('a signed-in user skips the landing and auth pages', async ({ page }) => {
  for (const path of ['/', '/login', '/signup', '/forgot-password']) {
    await page.goto(path)
    await expect(page).toHaveURL('/dashboard')
  }
  await expect(page.getByTestId('dashboard-current-balance')).toBeVisible()
})
