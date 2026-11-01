import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { AppShell } from '../pages/app-shell.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import {
  E2E_PHONE,
  uniqueAccountNumber,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

const VIEW_PLAN = 'View Premium plan'

// The shared global-setup user is on the free plan.
test.describe('free plan limits', () => {
  test('recording a received cheque prompts an upgrade and leads to the plan', async ({
    page,
  }) => {
    const shell = new AppShell(page)
    await new ChequesPage(page).goto()
    await new ChequesPage(page).openCreate()

    const inwardTab = page.getByTestId('cheque-type-inward')
    await inwardTab.click()
    const sheet = shell.upgradeSheet('Inward cheque tracking')
    await expect(sheet).toBeVisible()
    await expect(inwardTab).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByTestId('cheque-type-outward')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await sheet.getByRole('button', { name: VIEW_PLAN }).click()
    await expect(page).toHaveURL('/features')
    await expect(
      page.getByRole('button', { name: 'Get Premium - Lifetime' }),
    ).toBeVisible()
  })

  test('duplicating or printing a cheque is held behind Premium', async ({
    page,
  }) => {
    const shell = new AppShell(page)
    const partyName = uniqueE2eName('party')
    const accountNumber = uniqueAccountNumber()
    const chequeNumber = uniqueChequeNumber()
    const chequesPage = new ChequesPage(page)

    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )
    await chequesPage.createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber,
    })
    await chequesPage.openByChequeNumber(chequeNumber)
    const detailUrl = page.url()

    await page.getByTestId('speed-dial-toggle').click()
    await page.getByTestId('cheque-detail-duplicate').click()
    await expect(
      shell.upgradeSheet('Duplicate cheque to a draft'),
    ).toBeVisible()
    await expect(page).toHaveURL(detailUrl)
    await shell
      .upgradeSheet('Duplicate cheque to a draft')
      .getByRole('button', { name: 'Maybe Later' })
      .click()

    await page.getByTestId('speed-dial-toggle').click()
    await page.getByTestId('cheque-detail-print').click()
    await expect(
      shell.upgradeSheet('Cheque printing & saved layouts'),
    ).toBeVisible()
    await expect(page).toHaveURL(detailUrl)
  })

  test('reports explain the plan and link to it', async ({ page }) => {
    await page.goto('/reports')
    const gate = page.getByTestId('reports-premium-gate')
    await expect(gate).toContainText('Advanced reports & exports')
    await gate.getByRole('button', { name: VIEW_PLAN }).click()
    await page
      .getByRole('dialog', { name: 'Advanced reports & exports' })
      .getByRole('button', { name: VIEW_PLAN })
      .click()
    await expect(page).toHaveURL('/features')
  })
})
