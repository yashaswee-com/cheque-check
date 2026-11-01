import { expect, type Page } from '@playwright/test'

export class PartiesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/parties')
  }

  async createParty(name: string, contact: string) {
    await this.page.goto('/parties/create')
    await this.page.locator('#name').fill(name)
    await this.page.locator('#contact').fill(contact)
    await this.page.getByTestId('party-step1-continue').click()
    await this.page.getByTestId('party-step2-skip').click()
    await this.page.getByTestId('party-submit-button').click()
    const successButton = this.page.getByTestId('creation-success-continue')
    await expect(successButton).toBeVisible()
    await successButton.click()
  }

  async openByName(name: string) {
    await this.goto()
    await this.page.getByRole('link').filter({ hasText: name }).click()
  }
}
