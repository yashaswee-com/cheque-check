import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import {
  E2E_PHONE,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

// Uses the shared authenticated + onboarded session from global.setup.ts.
test.describe('accounts', () => {
  test('an owner adds bank accounts and new cheques use the default one', async ({
    page,
  }) => {
    const accountsPage = new AccountsPage(page)
    const chequesPage = new ChequesPage(page)
    const primaryName = uniqueE2eName('primary')
    const primaryNumber = uniqueAccountNumber()

    await accountsPage.fillUntilFinalStep(primaryName, primaryNumber, {
      bankSearch: 'HDFC Bank Limited',
      openingBalance: 75000,
      isDefault: true,
      ifsc: 'HDFC1234',
    })
    await page.getByTestId('account-submit-button').click()
    await expect(
      page.getByText('Enter a valid 11-character IFSC code'),
    ).toBeVisible()
    await expect(page.getByTestId('creation-success-continue')).toHaveCount(0)
    await page.locator('#ifsc_code').fill('hdfc0001234')
    await accountsPage.submitAndContinue()

    await accountsPage.openByName(primaryName)
    await expect(page.getByTestId('account-detail-ifsc')).toHaveText(
      'HDFC0001234',
    )
    await expect(
      page.getByTestId('account-detail-opening-balance'),
    ).toContainText('75,000.00')

    await chequesPage.goto()
    await chequesPage.openCreate()
    await chequesPage.fillDetails({
      amount: 100,
      chequeNumber: uniqueChequeNumber(),
    })
    await expect(page.getByTestId('cheque-account-combobox')).toContainText(
      `(${primaryNumber.slice(-4)})`,
    )
    await chequesPage.discardAndLeave()

    // A local bank missing from the catalog is added privately and becomes the new default.
    const coopBank = uniqueE2eName('coop-bank')
    const secondaryNumber = uniqueAccountNumber()
    await accountsPage.createAccount(
      uniqueE2eName('secondary'),
      secondaryNumber,
      { customBankName: coopBank, isDefault: true },
    )

    await chequesPage.goto()
    await chequesPage.openCreate()
    await chequesPage.fillDetails({
      amount: 100,
      chequeNumber: uniqueChequeNumber(),
    })
    const accountCombobox = page.getByTestId('cheque-account-combobox')
    await expect(accountCombobox).toContainText(coopBank)
    await expect(accountCombobox).toContainText(
      `(${secondaryNumber.slice(-4)})`,
    )
    await chequesPage.discardAndLeave()
  })

  test('creates, edits, and deletes a bank account', async ({ page }) => {
    const accountName = uniqueE2eName('account')
    const updatedName = `${accountName}-updated`
    const accountNumber = uniqueChequeNumber() + uniqueChequeNumber()
    const accountsPage = new AccountsPage(page)

    await accountsPage.createAccount(accountName, accountNumber)
    await accountsPage.openByName(accountName)
    await page.getByTestId('speed-dial-edit-link').click()
    const accountNameInput = page.locator('#account_name')
    await accountNameInput.fill(updatedName)
    await expect(accountNameInput).toHaveValue(updatedName)
    const updateResponsePromise = page.waitForResponse((response) => {
      const request = response.request()
      return (
        request.method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith('/accounts')
      )
    })
    await page.getByTestId('account-edit-submit-button').click()
    expect((await updateResponsePromise).ok()).toBe(true)
    await expect(page.getByText(updatedName).first()).toBeVisible()

    await page.getByTestId('speed-dial-edit-link').click()
    await page.getByTestId('account-delete-trigger').click()
    await page.locator('#confirm_name').fill(updatedName)
    await page.getByTestId('delete-dialog-confirm-button').click()

    await expect(page).toHaveURL('/accounts')
    await expect(
      page.getByRole('link').filter({ hasText: updatedName }),
    ).toHaveCount(0)
  })

  test('soft-deletes an account without removing its linked cheque', async ({
    page,
  }) => {
    const partyName = uniqueE2eName('party')
    const accountName = uniqueE2eName('account')
    const accountNumber = uniqueChequeNumber() + uniqueChequeNumber()
    const chequeNumber = uniqueChequeNumber()
    const accountsPage = new AccountsPage(page)

    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await accountsPage.createAccount(accountName, accountNumber)
    await new ChequesPage(page).createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber,
    })

    await accountsPage.openByName(accountName)
    await page.getByTestId('speed-dial-edit-link').click()
    await page.getByTestId('account-delete-trigger').click()
    await page.locator('#confirm_name').fill(accountName)
    await page.getByTestId('delete-dialog-confirm-button').click()

    await page.goto('/accounts')
    await expect(
      page.getByRole('link').filter({ hasText: accountName.slice(0, 15) }),
    ).toHaveCount(0)
    await page.goto('/cheques')
    await expect(page.getByText(`#${chequeNumber}`).first()).toBeVisible()
  })
})
