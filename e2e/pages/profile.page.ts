import { expect, type Page } from '@playwright/test'

export class ProfilePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/profile')
    await expect(this.nameInput).toBeVisible()
  }

  get nameInput() {
    return this.page.locator('#profile-name')
  }

  get saveButton() {
    return this.page.getByRole('button', { name: 'Save profile' })
  }

  async rename(name: string) {
    await this.nameInput.fill(name)
    await this.saveButton.click()
    await expect(
      this.page.locator('[data-slot="toast-title"]').filter({
        hasText: 'Profile updated',
      }),
    ).toBeVisible()
  }

  /** Type-to-confirm uses the profile name, or the email when no name is set. */
  async deleteAccount() {
    const confirmName =
      (await this.nameInput.inputValue()) ||
      (await this.page.locator('#profile-email').inputValue())
    await this.page.getByText('Delete My Account', { exact: true }).click()
    await this.page.locator('#confirm_name').fill(confirmName)
    await this.page.getByTestId('delete-dialog-confirm-button').click()
  }
}
