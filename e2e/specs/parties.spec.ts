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
test.describe('parties', () => {
  test('an owner records a customer with details and follows their cheques', async ({
    page,
  }) => {
    const partyName = uniqueE2eName('client')
    const tagName = uniqueE2eName('vip')
    const address = '12 Market Road, Pune'
    const accountNumber = uniqueAccountNumber()
    const chequeNumber = uniqueChequeNumber()
    const partiesPage = new PartiesPage(page)
    const chequesPage = new ChequesPage(page)

    await page.goto('/parties/create')
    await page.locator('#name').fill(partyName)
    await page.locator('#contact').fill(E2E_PHONE)
    await page.getByText('Optional details', { exact: true }).click()
    await page.locator('#email').fill(`${partyName}@example.com`)
    await page.locator('#address').fill(address)
    await page.getByTestId('tag-selector-trigger').click()
    await page.getByTestId('tag-selector-create-input').fill(tagName)
    await page.getByTestId('tag-selector-create-button').click()
    await expect(
      page
        .locator('[data-testid^="tag-selector-option-"]')
        .filter({ hasText: tagName }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')
    await page.getByTestId('party-submit-button').click()
    await page.getByTestId('creation-success-continue').click()

    // Re-entering the same customer warns before a duplicate is saved.
    await page.goto('/parties/create')
    await page.locator('#name').fill(partyName.toUpperCase())
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Similar parties already exist' }),
    ).toContainText(partyName)
    await page.getByRole('button', { name: 'Go back', exact: true }).click()
    await page
      .getByRole('dialog', { name: 'Save this as a draft?' })
      .getByRole('button', { name: 'Discard', exact: true })
      .click()
    await expect(page).not.toHaveURL(/\/parties\/create/)

    await new AccountsPage(page).createAccount(
      uniqueE2eName('account'),
      accountNumber,
    )
    await chequesPage.createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber,
      amount: 3300,
    })

    await partiesPage.openByName(partyName)
    await expect(page.getByText(address)).toBeVisible()
    await expect(page.getByText(tagName).first()).toBeVisible()
    await expect(page.getByTestId('party-detail-outstanding')).toHaveText(
      '₹3,300',
    )
    await expect(page.getByTestId('party-detail-total-cheques')).toHaveText('1')
    await chequesPage.openByChequeNumber(chequeNumber)
    await expect(page.getByTestId('cheque-detail-amount')).toContainText(
      '3,300',
    )
    await expect(page.getByText(partyName).first()).toBeVisible()
  })

  test('creates, edits, and deletes a party', async ({ page }) => {
    const partyName = uniqueE2eName('party')
    const updatedName = `${partyName}-updated`
    const partiesPage = new PartiesPage(page)

    await partiesPage.createParty(partyName, E2E_PHONE)
    await partiesPage.openByName(partyName)
    await page.getByTestId('speed-dial-edit-link').click()
    const partyNameInput = page.locator('#name')
    await partyNameInput.fill(updatedName)
    await expect(partyNameInput).toHaveValue(updatedName)
    const updateResponsePromise = page.waitForResponse((response) => {
      const request = response.request()
      return (
        request.method() === 'PATCH' &&
        new URL(response.url()).pathname.endsWith('/parties')
      )
    })
    await page.getByTestId('party-edit-submit-button').click()
    expect((await updateResponsePromise).ok()).toBe(true)
    await expect(page.getByText(updatedName).first()).toBeVisible()

    await page.getByTestId('speed-dial-edit-link').click()
    await page.getByTestId('party-delete-trigger').click()
    await page.locator('#confirm_name').fill(updatedName)
    await page.getByTestId('delete-dialog-confirm-button').click()

    await expect(page).toHaveURL('/parties')
    await expect(
      page.getByRole('link').filter({ hasText: updatedName }),
    ).toHaveCount(0)
  })

  test('blocks an invalid phone number from creating the party', async ({
    page,
  }) => {
    await page.goto('/parties/create')
    await page.locator('#name').fill(uniqueE2eName('party'))

    await page.locator('#contact').fill('123')
    await page.getByTestId('party-submit-button').click()
    await expect(page.getByText('Enter a valid phone number')).toBeVisible()
    await expect(page.getByTestId('creation-success-continue')).toHaveCount(0)
    await expect(page).toHaveURL(/\/parties\/create/)
  })

  test('soft-deletes a party without removing its linked cheque', async ({
    page,
  }) => {
    const partyName = uniqueE2eName('party')
    const accountName = uniqueE2eName('account')
    const accountNumber = uniqueChequeNumber() + uniqueChequeNumber()
    const chequeNumber = uniqueChequeNumber()
    const partiesPage = new PartiesPage(page)

    await partiesPage.createParty(partyName, E2E_PHONE)
    await new AccountsPage(page).createAccount(accountName, accountNumber)
    await new ChequesPage(page).createCheque({
      partyName,
      accountSearch: accountNumber.slice(-4),
      chequeNumber,
    })

    await partiesPage.openByName(partyName)
    await page.getByTestId('speed-dial-edit-link').click()
    await page.getByTestId('party-delete-trigger').click()
    await page.locator('#confirm_name').fill(partyName)
    await page.getByTestId('delete-dialog-confirm-button').click()

    await page.goto('/parties')
    await expect(
      page.getByRole('link').filter({ hasText: partyName }),
    ).toHaveCount(0)
    await page.goto('/cheques')
    await expect(page.getByText(`#${chequeNumber}`).first()).toBeVisible()
  })
})
