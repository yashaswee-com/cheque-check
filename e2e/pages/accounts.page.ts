import { expect, type Page } from '@playwright/test'

export interface AccountDetails {
  /** Picks a catalog bank by searching for it; defaults to the first listed bank. */
  bankSearch?: string
  /** Creates a private bank through "Other / Add bank" instead of using the catalog. */
  customBankName?: string
  openingBalance?: number
  ifsc?: string
  isDefault?: boolean
}

export class AccountsPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/accounts')
  }

  async chooseBank({
    bankSearch,
    customBankName,
  }: Pick<AccountDetails, 'bankSearch' | 'customBankName'> = {}) {
    await this.page.getByTestId('bank-selector-trigger').click()
    if (customBankName) {
      await this.page
        .getByRole('button', { name: 'Other / Add bank', exact: true })
        .click()
      const dialog = this.page.getByRole('dialog', { name: 'Add private bank' })
      await dialog.getByLabel('Bank name').fill(customBankName)
      await dialog.getByRole('button', { name: 'Add private bank' }).click()
      await expect(dialog).toHaveCount(0)
      await expect(
        this.page.getByTestId('bank-selector-trigger'),
      ).toContainText(customBankName)
      return
    }
    if (bankSearch) {
      await this.page.getByPlaceholder('Search bank...').fill(bankSearch)
      const option = this.page
        .getByTestId('bank-option')
        .filter({ hasText: bankSearch })
        .first()
      await option.click()
      await expect(
        this.page.getByTestId('bank-selector-trigger'),
      ).toContainText(bankSearch)
      return
    }
    await this.page.getByTestId('bank-option').first().click()
  }

  /** Fills steps 1-2 of the account wizard and stops on step 3 (IFSC + submit). */
  async fillUntilFinalStep(
    accountName: string,
    accountNumber: string,
    details: AccountDetails = {},
  ) {
    await this.page.goto('/accounts/create')
    await this.page.locator('#account_name').fill(accountName)
    await this.page.getByTestId('account-step1-continue').click()
    await this.chooseBank(details)
    await this.page.locator('#account_number').fill(accountNumber)
    if (details.openingBalance !== undefined) {
      await this.page
        .locator('#opening_balance')
        .fill(String(details.openingBalance))
    }
    if (details.isDefault) {
      const checkbox = this.page.getByTestId('account-default-checkbox')
      await checkbox.click()
      await expect(checkbox).toHaveAttribute('aria-checked', 'true')
    }
    await this.page.getByTestId('account-step2-continue').click()
    if (details.ifsc !== undefined) {
      await this.page.locator('#ifsc_code').fill(details.ifsc)
    }
  }

  async submitAndContinue() {
    await this.page.getByTestId('account-submit-button').click()
    const successButton = this.page.getByTestId('creation-success-continue')
    await expect(successButton).toBeVisible()
    await successButton.click()
  }

  async createAccount(
    accountName: string,
    accountNumber: string,
    details: AccountDetails = {},
  ) {
    await this.fillUntilFinalStep(accountName, accountNumber, details)
    await this.submitAndContinue()
  }

  async openByName(accountName: string) {
    await this.goto()
    await this.page.getByRole('link').filter({ hasText: accountName }).click()
  }
}
