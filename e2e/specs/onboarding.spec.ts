import { test, expect } from '@playwright/test'
import { LoginPage } from '../pages/login.page'
import { e2eBusinessName, e2eUser } from '../fixtures/test-data'
import { createConfirmedE2eUser } from '../admin-client'

// Own fresh user per test, independent of the shared global-setup session,
// since onboarding can only be driven once per account.
test.describe('onboarding', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  async function signInAndReachOnboarding(
    page: import('@playwright/test').Page,
  ) {
    const user = e2eUser('onboarding')
    await createConfirmedE2eUser(user)

    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.login(user.email, user.password)
    await page.waitForURL('/onboarding')
  }

  test('step 1 continue is disabled until a business name is entered', async ({
    page,
  }) => {
    await signInAndReachOnboarding(page)

    const continueButton = page.getByTestId('onboarding-step1-continue')
    await expect(continueButton).toBeDisabled()

    await page
      .getByTestId('onboarding-business-name-input')
      .fill(e2eBusinessName('step1'))
    await expect(continueButton).toBeEnabled()
  })

  test('completes the wizard and reaches the dashboard', async ({ page }) => {
    await signInAndReachOnboarding(page)

    const businessName = e2eBusinessName('complete')
    await page.getByTestId('onboarding-business-name-input').fill(businessName)
    await page.getByTestId('onboarding-step1-continue').click()
    await page.getByTestId('onboarding-step2-continue').click()
    await page.getByTestId('onboarding-step3-continue').click()
    await expect(page.getByTestId('onboarding-step4-finish')).toBeDisabled()
    await page.getByTestId('onboarding-accept-terms-checkbox').check()
    await page.getByTestId('onboarding-step4-finish').click()

    await expect(page.getByTestId('onboarding-enter-dashboard')).toBeVisible()
    await page.getByTestId('onboarding-enter-dashboard').click()

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByTestId('bottom-nav-dashboard')).toBeVisible()
    await page.goto('/cheques')
    await expect(page.getByTestId('cheques-empty-state')).toBeVisible()
  })

  for (const viewport of [
    { width: 320, height: 480 },
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    test(`keeps every primary action docked at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await signInAndReachOnboarding(page)
      await page
        .getByTestId('onboarding-business-name-input')
        .fill(e2eBusinessName('docked'))
      await expect(page.getByTestId('onboarding-business-logo')).toBeVisible()

      for (let step = 1; step <= 4; step += 1) {
        const action = page.getByTestId(
          step === 4
            ? 'onboarding-step4-finish'
            : `onboarding-step${step}-continue`,
        )
        await expect(action).toBeInViewport()
        const slot = page.getByTestId('shell-bottom-slot')
        await expect(slot).toContainText(await action.innerText())
        const frame = await page.locator('#app-shell').boundingBox()
        const before = await action.boundingBox()
        expect(frame).not.toBeNull()
        expect(before).not.toBeNull()
        expect(before!.y).toBeGreaterThan(frame!.y + frame!.height - 100)
        const form = page.locator('#onboarding-form')
        await form.evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        const after = await action.boundingBox()
        expect(after!.y).toBeCloseTo(before!.y, 0)
        expect(
          await form.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true)
        if (step < 4) await action.click()
      }
      await expect(page.getByTestId('onboarding-step4-finish')).toBeDisabled()
      await page.getByTestId('onboarding-accept-terms-checkbox').check()
      await expect(page.getByTestId('onboarding-step4-finish')).toBeEnabled()
    })
  }

  test('navigating back to step 1 preserves the entered business name', async ({
    page,
  }) => {
    await signInAndReachOnboarding(page)

    const businessName = e2eBusinessName('back-nav')
    await page.getByTestId('onboarding-business-name-input').fill(businessName)
    await page.getByTestId('onboarding-step1-continue').click()
    await expect(page.getByTestId('onboarding-step2-continue')).toBeVisible()

    await page.getByTestId('onboarding-back-button').click()
    await expect(
      page.getByTestId('onboarding-business-name-input'),
    ).toHaveValue(businessName)
  })
})
