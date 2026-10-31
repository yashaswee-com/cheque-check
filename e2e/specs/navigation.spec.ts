import { expect, test } from '@playwright/test'
import { AppShell, type BottomNavTab } from '../pages/app-shell.page'

// Uses the shared authenticated + onboarded session from global.setup.ts.
test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the owner moves between tabs and starts a new record from each one', async ({
    page,
  }) => {
    const shell = new AppShell(page)
    await page.goto('/dashboard')
    await expect(shell.bottomNav('dashboard')).toHaveAttribute(
      'aria-current',
      'page',
    )

    const createTargets: Array<[BottomNavTab, string]> = [
      ['dashboard', '/cheques/create'],
      ['cheques', '/cheques/create'],
      ['parties', '/parties/create'],
      ['accounts', '/accounts/create'],
    ]
    for (const [tab, createPath] of createTargets) {
      await shell.openTab(tab)
      await shell.createFab.click()
      await expect(page).toHaveURL(createPath)
      // Create forms are focused workflows without the tab bar or another FAB.
      await expect(shell.bottomNav(tab)).toHaveCount(0)
      await expect(shell.createFab).toHaveCount(0)
      await shell.backButton.click()
      await expect(page).toHaveURL(`/${tab}`)
    }
  })

  test('settings pages keep the tab bar but hide the create button', async ({
    page,
  }) => {
    const shell = new AppShell(page)
    await page.goto('/dashboard')
    await shell.openSettings()
    await expect(shell.bottomNav('dashboard')).toBeVisible()
    await expect(shell.createFab).toHaveCount(0)

    await page.locator('a[href="/settings/preferences"]').click()
    await expect(page).toHaveURL('/settings/preferences')
    await shell.backButton.click()
    await expect(page).toHaveURL('/settings')

    await shell.openTab('cheques')
    await expect(shell.createFab).toBeVisible()
  })
})
