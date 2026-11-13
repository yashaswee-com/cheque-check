import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const width of [320, 390, 1280]) {
  for (const route of ['/', '/pricing']) {
    test(`Free and Premium comparison fits ${route} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(route)
      const main = page.getByRole('main')
      await expect(
        main.getByRole('heading', { name: 'Lifetime Premium', exact: true }),
      ).toBeVisible()
      await expect(
        main.getByRole('heading', { name: 'Free', exact: true }),
      ).toBeVisible()
      await expect(main.getByText('₹0', { exact: true })).toBeVisible()
      await expect(
        main.locator('a[href="/signup"][data-app-entry]').last(),
      ).toBeAttached()
      await expect(
        main.getByText(/Signup se yeh offer automatic activate nahi hota/),
      ).toBeVisible()
      await expect(main.getByText(/PublicSite\.comparison\./)).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)

      if (route === '/pricing') {
        const table = page.getByRole('table', {
          name: 'Free aur Premium ka comparison',
        })
        await expect(table.getByRole('row')).toHaveCount(17)
        const scroller = page.getByRole('region', {
          name: 'Free aur Premium ka comparison',
        })
        expect((await scroller.boundingBox())!.width).toBeLessThanOrEqual(width)
        await scroller.focus()
        await expect(scroller).toBeFocused()
        await expect(
          table.getByText('Alag credits', { exact: true }),
        ).toHaveCount(2)
      } else {
        await expect(page.getByRole('table')).toHaveCount(0)
      }
    })
  }
}
