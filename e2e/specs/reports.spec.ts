import { expect, test } from '@playwright/test'
import { AccountsPage } from '../pages/accounts.page'
import { ChequesPage } from '../pages/cheques.page'
import { PartiesPage } from '../pages/parties.page'
import { signInAsNewOnboardedUser } from '../flows'
import {
  E2E_PHONE,
  uniqueChequeNumber,
  uniqueE2eName,
} from '../fixtures/test-data'

// The shared global-setup user has no premium entitlement.
test('non-premium users see the reports paywall', async ({ page }) => {
  await page.goto('/reports')
  await expect(page.getByTestId('reports-premium-gate')).toBeVisible()
})

test.describe('premium reports', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('premium user downloads PDF/Excel and queues CSV/JSON exports', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'reports', { premium: true })

    const partyName = uniqueE2eName('party')
    const accountName = uniqueE2eName('account')
    const accountNumber = uniqueChequeNumber() + uniqueChequeNumber()
    await new PartiesPage(page).createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(accountName, accountNumber)
    await new ChequesPage(page).createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber: uniqueChequeNumber(),
    })

    await page.goto('/reports')
    await expect(page.getByTestId('reports-content')).toBeVisible()

    for (const [format, extension] of [
      ['pdf', '.pdf'],
      ['excel', '.xlsx'],
    ] as const) {
      await page.getByTestId('reports-export-trigger').click()
      const downloadPromise = page.waitForEvent('download')
      await page.getByTestId(`reports-export-${format}`).click()
      const download = await downloadPromise
      expect(download.suggestedFilename().endsWith(extension)).toBe(true)
    }

    // CSV/JSON are durable background jobs; the worker finishes them out of band.
    for (const format of ['csv', 'json'] as const) {
      await page.getByTestId('reports-export-trigger').click()
      await page.getByTestId(`reports-export-${format}`).click()
      await expect(
        page.locator(
          `[data-testid="report-export-job"][data-format="${format}"]`,
        ),
      ).toHaveAttribute('data-status', /^(queued|processing|ready)$/)
    }

    // The owner changes their mind about the CSV export and removes it.
    const csvJob = page.locator(
      '[data-testid="report-export-job"][data-format="csv"]',
    )
    await csvJob.getByRole('button', { name: 'Cancel / remove' }).click()
    await expect(
      page.locator(
        '[data-testid="report-export-job"][data-format="csv"]:not([data-status="expired"])',
      ),
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="report-export-job"][data-format="json"]'),
    ).not.toHaveAttribute('data-status', 'expired')
  })

  test('export is disabled for a premium user with no cheques yet', async ({
    page,
  }) => {
    await signInAsNewOnboardedUser(page, 'reports-empty', { premium: true })

    await page.goto('/reports')
    await expect(page.getByTestId('reports-export-trigger')).toBeDisabled()
  })
})
