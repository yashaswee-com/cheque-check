import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import {
  E2E_PHONE,
  isoDateFromToday,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

// Uses the shared authenticated + onboarded session from global.setup.ts.
test.describe('cheque lifecycle journeys', () => {
  test('a bounced cheque is re-presented and then clears', async ({ page }) => {
    const partyName = uniqueE2eName('bounce')
    const accountNumber = uniqueAccountNumber()
    const chequeNumber = uniqueChequeNumber()
    const partiesPage = new PartiesPage(page)
    const chequesPage = new ChequesPage(page)

    await partiesPage.createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )
    await chequesPage.createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber,
      amount: 4200,
    })

    await chequesPage.openByChequeNumber(chequeNumber)
    await chequesPage.setStatusFromDetail('Bounced')

    await partiesPage.openByName(partyName)
    await expect(page.getByTestId('party-detail-outstanding')).toHaveText('₹0')
    await expect(chequesPage.card(chequeNumber)).toContainText('Bounced')

    // The owner deposits the same cheque again: correct it back to Issued.
    await chequesPage.goto()
    await page.getByTestId('cheque-search-input').fill(chequeNumber)
    await page.getByTestId('cheque-filter-trigger').click()
    await page.getByTestId('cheque-filter-status-bounced').click()
    await expect(chequesPage.card(chequeNumber)).toBeVisible()
    await chequesPage.openByChequeNumber(chequeNumber)
    await chequesPage.setStatusFromDetail('Issued')

    await partiesPage.openByName(partyName)
    await expect(page.getByTestId('party-detail-outstanding')).toHaveText(
      '₹4,200',
    )

    await chequesPage.goto()
    await chequesPage.openByChequeNumber(chequeNumber)
    await chequesPage.setStatusFromDetail('Cleared')

    await chequesPage.goto()
    await page.getByTestId('cheque-search-input').fill(chequeNumber)
    await page.getByTestId('cheque-filter-trigger').click()
    await page.getByTestId('cheque-filter-status-cleared').click()
    await expect(chequesPage.card(chequeNumber)).toContainText('Cleared')
    await partiesPage.openByName(partyName)
    await expect(page.getByTestId('party-detail-outstanding')).toHaveText('₹0')
    await expect(page.getByTestId('party-detail-total-cheques')).toHaveText('1')
  })

  test('a crore-scale cheque keeps its exact value and amount in words', async ({
    page,
  }) => {
    const partyName = uniqueE2eName('crore')
    const accountNumber = uniqueAccountNumber()
    const chequeNumber = uniqueChequeNumber()
    const chequesPage = new ChequesPage(page)

    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )

    await chequesPage.goto()
    await chequesPage.openCreate()
    await page.getByTestId('cheque-amount-input').fill('10010000000')
    await expect(page.getByTestId('cheque-amount-words')).toHaveText(
      /One Thousand One Crore Rupees Only/i,
    )
    await page.getByTestId('cheque-number-input').fill(chequeNumber)
    await page.getByTestId('cheque-step1-continue').click()
    await chequesPage.selectPartyAndAccount(partyName, accountNumber.slice(-4))
    await chequesPage.finishAndSubmit(isoDateFromToday(7))

    await chequesPage.openByChequeNumber(chequeNumber)
    await expect(page.getByTestId('cheque-detail-amount')).toContainText(
      '₹10,010,000,000',
    )
  })
})
