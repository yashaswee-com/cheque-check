import { expect, type Page } from '@playwright/test'

/** Drives the four-step wizard, including required terms acceptance. */
export class OnboardingPage {
  constructor(private readonly page: Page) {}

  async expectVisible() {
    await expect(this.page).toHaveURL('/onboarding')
  }

  get businessNameInput() {
    return this.page.getByTestId('onboarding-business-name-input')
  }

  async completeWithDefaults(businessName: string) {
    await this.businessNameInput.fill(businessName)
    await this.page.getByTestId('onboarding-step1-continue').click()
    await this.page.getByTestId('onboarding-step2-continue').click()
    await this.page.getByTestId('onboarding-step3-continue').click()
    await this.page.getByTestId('onboarding-accept-terms-checkbox').check()
    await this.page.getByTestId('onboarding-step4-finish').click()
    await this.page.getByTestId('onboarding-enter-dashboard').click()
  }
}
