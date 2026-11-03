import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { AppShell } from '../pages/app-shell.page'
import { ChequesPage } from '../pages/cheques.page'
import { signInAsNewOnboardedUser } from '../flows'
import {
  E2E_PHONE,
  isoDateFromToday,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

// A brand-new owner has no parties or accounts, so the first cheque has to
// create both inline and return to the same cheque draft each time.
test.describe('first day with ChequeCheck', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a new owner records their first cheque from an empty workspace', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'first-run')
    const shell = new AppShell(page)
    const chequesPage = new ChequesPage(page)
    const partyName = uniqueE2eName('first-party')
    const accountName = uniqueE2eName('first-account')
    const accountNumber = uniqueAccountNumber()
    const chequeNumber = uniqueChequeNumber()

    await expect(page.getByTestId('dashboard-current-balance')).toHaveText('₹0')
    await expect(page.getByText('No cheques due today')).toBeVisible()

    await shell.createFab.click()
    await expect(page).toHaveURL('/cheques/create')
    await chequesPage.fillDetails({ amount: 25000, chequeNumber })

    await page.getByTestId('cheque-party-combobox').click()
    await page.getByTestId('cheque-party-combobox-search').fill(partyName)
    await page
      .getByRole('button', { name: `Add new party "${partyName}"` })
      .click()
    await expect(page).toHaveURL(/\/parties\/create\?.*returnTo=/)
    await expect(page.locator('#name')).toHaveValue(partyName)
    await page.locator('#contact').fill(E2E_PHONE)
    await page.getByTestId('party-step1-continue').click()
    await page.getByTestId('party-step2-skip').click()
    await page.getByTestId('party-submit-button').click()
    await page.getByTestId('creation-success-continue').click()

    await expect(page).toHaveURL(/\/cheques\/create\?draftId=/)
    await expect(page.getByTestId('cheque-party-combobox')).toContainText(
      partyName,
    )
    await page.getByTestId('cheque-account-combobox').click()
    await page.getByTestId('cheque-account-combobox-search').fill(accountName)
    await page
      .getByRole('button', { name: `Add new account "${accountName}"` })
      .click()
    await expect(page).toHaveURL(/\/accounts\/create\?.*returnTo=/)

    const accountsPage = new AccountsPage(page)
    await expect(page.locator('#account_name')).toHaveValue(accountName)
    await page.getByTestId('account-step1-continue').click()
    await accountsPage.chooseBank()
    await page.locator('#account_number').fill(accountNumber)
    await page.locator('#opening_balance').fill('50000')
    await page.getByTestId('account-step2-continue').click()
    await accountsPage.submitAndContinue()

    await expect(page).toHaveURL(/\/cheques\/create\?draftId=/)
    await expect(page.getByTestId('cheque-account-combobox')).toContainText(
      `(${accountNumber.slice(-4)})`,
    )
    await page.getByTestId('cheque-step2-continue').click()
    await chequesPage.finishAndSubmit(isoDateFromToday(7))
    await expect(chequesPage.card(chequeNumber)).toBeVisible()

    await shell.openTab('dashboard')
    await expect(page.getByTestId('dashboard-current-balance')).toHaveText(
      '-₹25,000',
    )
    await expect(chequesPage.card(chequeNumber)).toBeVisible()

    await shell.openTab('accounts')
    await page
      .getByRole('link')
      .filter({ hasText: accountName.slice(0, 15) })
      .click()
    await expect(
      page.getByTestId('account-detail-opening-balance'),
    ).toContainText('50,000.00')
    await expect(chequesPage.card(chequeNumber)).toBeVisible()

    await shell.openTab('parties')
    await page.getByRole('link').filter({ hasText: partyName }).click()
    await expect(page.getByTestId('party-detail-outstanding')).toHaveText(
      '₹25,000',
    )
    await expect(page.getByTestId('party-detail-total-cheques')).toHaveText('1')
  })
})
