import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import { signInAsNewOnboardedUser } from '../flows'
import {
  E2E_PHONE,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

test.describe('premium workspace', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a premium owner clears every cheque for one party in a single action', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'bulk', { premium: true })
    const partyName = uniqueE2eName('supplier')
    const otherParty = uniqueE2eName('other')
    const accountNumber = uniqueAccountNumber()
    const partyCheques = [uniqueChequeNumber(), uniqueChequeNumber()]
    const otherCheque = uniqueChequeNumber()
    const chequesPage = new ChequesPage(page)

    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await new PartiesPage(page).createParty(otherParty, '+919810000001')
    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )
    for (const chequeNumber of partyCheques) {
      await chequesPage.createCheque({
        partyName,
        accountSearch: accountNumber.slice(-4),
        chequeNumber,
      })
    }
    await chequesPage.createCheque({
      partyName: otherParty,
      accountSearch: accountNumber.slice(-4),
      chequeNumber: otherCheque,
    })

    // The legacy /premium entry point lands on the matching in-page tool.
    await page.goto('/premium#bulk-actions')
    await expect(page).toHaveURL(/\/cheques#bulk-actions$/)
    const bulk = page.locator('details#bulk-actions')
    await expect(bulk).toBeVisible()
    if ((await bulk.getAttribute('open')) === null) {
      await bulk.locator('summary').click()
    }

    const partyFilter = bulk.getByLabel('Party', { exact: true })
    await expect(partyFilter).toBeVisible()
    await partyFilter.selectOption({ label: partyName })
    await bulk.getByRole('button', { name: 'Select all matches' }).click()
    await expect(bulk.getByText('2 cheques selected.')).toBeVisible()
    await expect(bulk.getByLabel('New status')).toHaveValue('Cleared')
    await bulk.getByRole('button', { name: 'Update selected' }).click()
    await bulk.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByText('Completed successfully.')).toBeVisible()

    await page.goto('/cheques')
    for (const chequeNumber of partyCheques) {
      await expect(chequesPage.card(chequeNumber)).toContainText('Cleared')
    }
    await chequesPage.openByChequeNumber(otherCheque)
    await expect(page.getByTestId('cheque-detail-status')).toContainText(
      'Issued',
    )
  })
})
