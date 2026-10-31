import { expect, type Page } from '@playwright/test'

export class ChequesPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/cheques')
  }

  async openCreate() {
    await this.page.getByTestId('app-fab-create').click()
    await expect(this.page).toHaveURL(/\/cheques\/create/)
  }

  /** Fills amount/number (step 1) and advances; cheque_date defaults to today. */
  async fillDetails({
    amount,
    chequeNumber,
    type = 'Outward',
  }: {
    amount: number
    chequeNumber: string
    type?: 'Outward' | 'Inward'
  }) {
    if (type === 'Inward') {
      const inwardTab = this.page.getByTestId('cheque-type-inward')
      // Inward is Premium-only and entitlements load asynchronously; the tab
      // rejects clicks (with an upgrade toast) until access is known.
      await expect(async () => {
        await inwardTab.click()
        await expect(inwardTab).toHaveAttribute('aria-selected', 'true', {
          timeout: 1_000,
        })
      }).toPass()
    }
    await this.page.getByTestId('cheque-amount-input').fill(String(amount))
    await this.page.getByTestId('cheque-number-input').fill(chequeNumber)
    await this.page.getByTestId('cheque-step1-continue').click()
  }

  /** Step 2: search+select an existing party and account by their unique names. */
  async selectPartyAndAccount(partySearch: string, accountSearch: string) {
    await this.page.getByTestId('cheque-party-combobox').click()
    await this.page
      .getByTestId('cheque-party-combobox-search')
      .fill(partySearch)
    await this.page.getByRole('option').first().click()

    await this.page.getByTestId('cheque-account-combobox').click()
    await this.page
      .getByTestId('cheque-account-combobox-search')
      .fill(accountSearch)
    await this.page.getByRole('option').first().click()

    await this.page.getByTestId('cheque-step2-continue').click()
  }

  /** Step 3: picks existing tags; the selector is a modal popover, so close it before continuing. */
  async selectTags(...tagNames: string[]) {
    await this.page.getByTestId('tag-selector-trigger').click()
    for (const tagName of tagNames) {
      const option = this.page
        .locator('[data-testid^="tag-selector-option-"]')
        .filter({ hasText: tagName })
      await option.click()
      await expect(option).toHaveAttribute('aria-pressed', 'true')
    }
    await this.page.keyboard.press('Escape')
    await expect(
      this.page.getByTestId('tag-selector-create-input'),
    ).toHaveCount(0)
  }

  /** Step 3: fills the required deposit date and submits. */
  async finishAndSubmit(
    depositDate: string,
    { dismissNps = true }: { dismissNps?: boolean } = {},
  ) {
    await this.page.locator('#deposit_date').fill(depositDate)
    await this.page.getByTestId('cheque-submit-button').click()
    const successButton = this.page.getByTestId('creation-success-continue')
    await expect(successButton).toBeVisible()
    await successButton.click()
    await expect(this.page).toHaveURL('/cheques')

    if (dismissNps) {
      const npsPrompt = this.page.getByTestId('nps-score-group')
      await npsPrompt
        .waitFor({ state: 'visible', timeout: 5_000 })
        .catch(() => {})
      if (await npsPrompt.isVisible()) {
        await this.page.getByTestId('nps-dismiss-button').click()
      }
    }
  }

  /** The "Save this as a draft?" sheet shown when leaving an unfinished form. */
  get leaveSheet() {
    return this.page.getByRole('dialog', { name: 'Save this as a draft?' })
  }

  /** Leaves an unfinished cheque form through the top bar and discards it. */
  async discardAndLeave() {
    await this.page
      .getByRole('button', { name: 'Go back', exact: true })
      .click()
    await this.leaveSheet
      .getByRole('button', { name: 'Discard', exact: true })
      .click()
    await expect(this.page).not.toHaveURL(/\/cheques\/create/)
  }

  /** On a cheque detail page: changes status through the speed-dial menu. */
  async setStatusFromDetail(
    status: 'Issued' | 'Received' | 'Cleared' | 'Bounced',
  ) {
    await this.page.getByTestId('speed-dial-toggle').click()
    await this.page.getByTestId(`cheque-status-${status.toLowerCase()}`).click()
    await expect(this.page.getByTestId('cheque-detail-status')).toContainText(
      status,
    )
  }

  card(chequeNumber: string) {
    return this.page
      .locator('[data-testid^="cheque-card-"]')
      .filter({ hasText: `#${chequeNumber}` })
  }

  async openByChequeNumber(chequeNumber: string) {
    const card = this.page
      .locator('[data-testid^="cheque-card-"]')
      .filter({ hasText: `#${chequeNumber}` })
    await expect(card).toBeVisible()
    const href = await card.locator('a').first().getAttribute('href')
    if (!href) throw new Error(`Cheque ${chequeNumber} has no detail link`)
    await this.page.goto(href)
    await expect(this.page.getByTestId('launch-splash')).toHaveCount(0)
    await expect(this.page).toHaveURL(/\/cheques\/[\w-]+$/)
  }

  async createCheque({
    partyName,
    accountSearch,
    chequeNumber,
    amount = 1500,
    type = 'Outward',
    dismissNps = true,
  }: {
    partyName: string
    accountSearch: string
    chequeNumber: string
    amount?: number
    type?: 'Outward' | 'Inward'
    dismissNps?: boolean
  }) {
    await this.goto()
    await this.openCreate()
    await this.fillDetails({ amount, chequeNumber, type })
    await this.selectPartyAndAccount(partyName, accountSearch)
    const depositDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    await this.finishAndSubmit(depositDate, { dismissNps })
  }

  chequeCard(chequeId: string) {
    return this.page.getByTestId(`cheque-card-${chequeId}`)
  }
}
