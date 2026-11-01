import { expect, test, type Page } from '@playwright/test'

type Destination = {
  href: string
  url: string | RegExp
  ready: (page: Page) => Promise<void>
}

const heading = (page: Page) =>
  expect(page.getByRole('heading').first()).toBeVisible()

// Every entry in the settings hub should land on a working page.
const destinations: Destination[] = [
  {
    href: '/cheques#bulk-import',
    url: '/settings',
    ready: (page) =>
      expect(
        page.getByRole('dialog', { name: 'Bulk CSV & Excel imports' }),
      ).toBeVisible(),
  },
  {
    href: '/settings/preferences',
    url: '/settings/preferences',
    ready: (page) =>
      expect(page.getByTestId('preferences-language')).toBeVisible(),
  },
  {
    href: '/settings/notifications',
    url: '/settings/notifications',
    ready: (page) =>
      expect(page.getByTestId('notifications-reminder-days')).toBeVisible(),
  },
  {
    href: '/settings/transactions',
    url: '/settings/transactions',
    ready: (page) =>
      expect(page.getByTestId('transactions-page')).toBeVisible(),
  },
  {
    href: '/features',
    url: '/features',
    ready: (page) => expect(page.getByTestId('features-page')).toBeVisible(),
  },
  {
    href: '/businesses',
    url: '/businesses',
    ready: (page) =>
      expect(
        page.locator('[data-testid^="business-card-"]').first(),
      ).toBeVisible(),
  },
  {
    href: '/reports',
    url: '/settings',
    ready: (page) =>
      expect(
        page.getByRole('dialog', { name: 'Advanced reports & exports' }),
      ).toBeVisible(),
  },
  { href: '/tags', url: '/tags', ready: heading },
  { href: '/settings/whats-new', url: '/settings/whats-new', ready: heading },
  {
    href: '/settings/help-and-support',
    url: '/settings/help-and-support',
    ready: heading,
  },
  { href: '/settings/about', url: '/settings/about', ready: heading },
  {
    href: '/settings/privacy-policy',
    url: '/settings/privacy-policy',
    ready: heading,
  },
  {
    href: '/settings/terms-and-conditions',
    url: '/settings/terms-and-conditions',
    ready: heading,
  },
  {
    href: '/settings/refund-policy',
    url: '/settings/refund-policy',
    ready: heading,
  },
  {
    href: '/profile',
    url: '/profile',
    ready: (page) => expect(page.locator('#profile-name')).toBeVisible(),
  },
]

// Uses the shared authenticated + onboarded session from global.setup.ts.
test.describe('settings hub', () => {
  test('every settings entry opens a working page', async ({ page }) => {
    for (const { href, url, ready } of destinations) {
      await test.step(href, async () => {
        await page.goto('/settings')
        await page.locator(`a[href="${href}"]`).first().click()
        await expect(page).toHaveURL(url)
        await ready(page)
      })
    }
  })

  test('the legacy tag settings route opens the tag workspace', async ({
    page,
  }) => {
    await page.goto('/settings/tags')
    await expect(page).toHaveURL('/tags')
  })
})
