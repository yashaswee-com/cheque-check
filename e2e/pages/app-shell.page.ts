import { expect, type Page } from '@playwright/test'

export type BottomNavTab = 'dashboard' | 'cheques' | 'parties' | 'accounts'

/** The authenticated app frame: top bar, bottom navigation, and create FAB. */
export class AppShell {
  constructor(private readonly page: Page) {}

  get createFab() {
    return this.page.getByTestId('app-fab-create')
  }

  get backButton() {
    return this.page.getByRole('button', { name: 'Go back', exact: true })
  }

  bottomNav(tab: BottomNavTab) {
    return this.page.getByTestId(`bottom-nav-${tab}`)
  }

  async openTab(tab: BottomNavTab) {
    await this.bottomNav(tab).click()
    await expect(this.page).toHaveURL(`/${tab}`)
    await expect(this.bottomNav(tab)).toHaveAttribute('aria-current', 'page')
  }

  async openMoreMenu() {
    await this.page.getByRole('button', { name: 'More actions' }).click()
  }

  async openCalculator() {
    await this.openMoreMenu()
    await this.page
      .getByRole('button', { name: 'Calculator', exact: true })
      .click()
    return this.page.getByRole('dialog', { name: 'Calculator' })
  }

  async openSettings() {
    await this.openMoreMenu()
    await this.page.getByRole('link', { name: 'Settings' }).click()
    await expect(this.page).toHaveURL('/settings')
  }

  /** Premium upgrade prompts surface as a toast with a "View Premium plan" action. */
  upgradeToast(featureTitle: string) {
    return this.page
      .locator('[data-slot="toast"]')
      .filter({ hasText: featureTitle })
  }
}
