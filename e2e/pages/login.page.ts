import { expect, type Page } from '@playwright/test'

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/login')
    if (await this.page.getByTestId('phone-auth-number-input').isVisible()) {
      await this.page.getByTestId('login-toggle-phone-button').click()
    }
  }

  get emailInput() {
    return this.page.getByTestId('login-email-input')
  }

  get passwordInput() {
    return this.page.getByTestId('login-password-input')
  }

  get submitButton() {
    return this.page.getByTestId('login-submit-button')
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email)
    await this.passwordInput.fill(password)
    await this.submitButton.click()
  }

  async expectRedirectedToDashboard() {
    await expect(this.page).toHaveURL('/dashboard')
  }
}
