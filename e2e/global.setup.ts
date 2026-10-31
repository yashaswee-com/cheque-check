import { test as setup } from '@playwright/test'
import { signInAsNewOnboardedUser } from './flows'
import { STORAGE_STATE_PATH } from './storage-state'

/**
 * Runs once before the main test suite: creates a confirmed e2e user,
 * completes onboarding through the UI, then persists the session so
 * most feature specs can skip repeating this and start straight on the dashboard.
 */
setup('authenticate via signup and onboarding', async ({ page }) => {
  await signInAsNewOnboardedUser(page, 'global')
  await page.context().storageState({ path: STORAGE_STATE_PATH })
})
