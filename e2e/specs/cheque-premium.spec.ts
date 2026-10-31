import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import { signInAsNewOnboardedUser } from '../flows'
import {
  E2E_PHONE,
  isoDateFromToday,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

test.describe('premium cheque tools', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a premium owner duplicates last month’s cheque for the next instalment', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'duplicate', { premium: true })
    const partyName = uniqueE2eName('landlord')
    const accountNumber = uniqueAccountNumber()
    const firstNumber = uniqueChequeNumber()
    const nextNumber = uniqueChequeNumber()
    const chequesPage = new ChequesPage(page)

    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )
    await chequesPage.createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber: firstNumber,
      amount: 18500,
    })

    await chequesPage.openByChequeNumber(firstNumber)
    await page.getByTestId('speed-dial-toggle').click()
    await page.getByTestId('cheque-detail-duplicate').click()

    await expect(page).toHaveURL(/\/cheques\/create\?draftId=/)
    await expect(page.getByTestId('cheque-amount-input')).toHaveValue('18500')
    await expect(page.getByTestId('cheque-number-input')).toHaveValue('')
    await page.getByTestId('cheque-number-input').fill(nextNumber)
    await page.getByTestId('cheque-step1-continue').click()
    await expect(page.getByTestId('cheque-party-combobox')).toContainText(
      partyName,
    )
    await expect(page.getByTestId('cheque-account-combobox')).toContainText(
      `(${accountNumber.slice(-4)})`,
    )
    await page.getByTestId('cheque-step2-continue').click()
    await chequesPage.finishAndSubmit(isoDateFromToday(30))

    await page.getByTestId('cheque-search-input').fill(partyName)
    await expect(chequesPage.card(firstNumber)).toBeVisible()
    await expect(chequesPage.card(nextNumber)).toBeVisible()
    await expect(page.locator('[data-testid^="cheque-card-"]')).toHaveCount(2)
  })
})
