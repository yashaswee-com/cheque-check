import type { Page } from '@playwright/test'
import { createConfirmedE2eUser, grantLifetimePremium } from './admin-client'
import { e2eBusinessName, e2eUser } from './fixtures/test-data'
import { LoginPage } from './pages/login.page'
import { OnboardingPage } from './pages/onboarding.page'

export const DASHBOARD_PATH = '/dashboard'

/**
 * Creates an admin-confirmed user, logs in through the UI, completes onboarding,
 * and waits on the dashboard. Use from specs that need an isolated account.
 */
export async function signInAsNewOnboardedUser(
  page: Page,
  label: string,
  { premium = false }: { premium?: boolean } = {},
) {
  const user = e2eUser(label)
  const businessName = e2eBusinessName(label)
  const createdUser = await createConfirmedE2eUser(user)
  if (premium) await grantLifetimePremium(createdUser.id)

  const loginPage = new LoginPage(page)
  await loginPage.goto()
  await loginPage.login(user.email, user.password)
  await page.waitForURL('/onboarding')

  await new OnboardingPage(page).completeWithDefaults(businessName)
  await page.waitForURL(DASHBOARD_PATH)

  return { user, userId: createdUser.id, businessName }
}
