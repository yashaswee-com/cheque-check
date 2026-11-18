import { expect, test } from '@playwright/test'
import english from '../../messages/en.json'
import hindi from '../../messages/hi.json'
import hinglish from '../../messages/hi-en.json'

const protectedPaths = [
  '/dashboard',
  '/cheques/00000000-0000-4000-8000-000000000000',
  '/settings/preferences',
  '/reports',
]

test.describe('public landing page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a visitor reaches login and signup from the landing page', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: english.PublicSite.landing.title }),
    ).toBeVisible()

    await page
      .getByRole('link', { name: english.PublicSite.nav.signIn, exact: true })
      .click()
    await expect(page).toHaveURL('/login')
    await expect(
      page.getByRole('heading', { name: 'Cheque Check', exact: true }),
    ).toBeVisible()

    await page.goBack()
    await page
      .getByRole('link', {
        name: english.PublicSite.landing.primaryCta,
        exact: true,
      })
      .first()
      .click()
    await expect(page).toHaveURL('/signup')
    await expect(
      page.getByRole('textbox', { name: 'Full name', exact: true }),
    ).toBeVisible()
  })

  for (const [locale, catalog] of [
    ['en', english],
    ['hi', hindi],
    ['hi-en', hinglish],
  ] as const) {
    test(`signup-focused ${locale} landing fits mobile and desktop`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: 'NEXT_LOCALE', value: locale, url: baseURL! },
      ])
      await page.goto('/')
      await expect(
        page.getByRole('heading', { name: catalog.PublicSite.landing.title }),
      ).toBeVisible()
      await expect(page.locator('main a[href="/signup"]')).toHaveCount(3)
      await expect(
        page
          .getByRole('link', {
            name: catalog.PublicSite.landing.secondaryCta,
          })
          .first(),
      ).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/)
      await expect(page.locator('header').getByRole('combobox')).toBeVisible()
      await expect(
        page
          .locator('header')
          .getByRole('button', { name: catalog.PublicSite.nav.navigation }),
      ).toHaveCount(0)
      await expect(page.locator('video')).not.toHaveAttribute('src')
      await expect(
        page.getByText(catalog.PublicSite.landing.scanGifPending),
      ).toHaveCount(0)
      const pdf = page.getByRole('link', { name: 'PDF', exact: true })
      const rejectCookies = page.getByRole('button', {
        name: catalog.PublicSite.cookieConsent.reject,
        exact: true,
      })
      if (await rejectCookies.isVisible()) await rejectCookies.click()
      const downloadPromise = page.waitForEvent('download')
      await pdf.click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toBe(
        'cheque-check-sample-report-en.pdf',
      )
      expect(await download.failure()).toBeNull()
      await page.setViewportSize({ width: 402, height: 874 })
      const gallery = page.locator('[data-slot="pill-scroller"]').filter({
        has: page.locator('[class*="phoneFrame"]'),
      })
      await expect(gallery.locator('figure')).toHaveCount(5)
      await gallery.scrollIntoViewIfNeeded()
      const controls = gallery.locator('..')
      await controls
        .getByRole('button', {
          name: catalog.SharedUI.scrollRight,
          exact: true,
        })
        .click()
      await expect
        .poll(() => gallery.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0)
      await controls
        .getByRole('button', { name: catalog.SharedUI.scrollLeft, exact: true })
        .click()
      await expect
        .poll(() => gallery.evaluate((element) => element.scrollLeft))
        .toBe(0)
      await page.evaluate(() => document.fonts.ready)
      for (const [width, height] of [
        [320, 568],
        [360, 800],
        [375, 812],
        [390, 844],
        [393, 852],
        [402, 874],
        [430, 932],
        [736, 414],
        [768, 1024],
        [820, 1180],
        [874, 402],
        [1024, 768],
        [1280, 800],
        [1440, 900],
        [1920, 1080],
      ]) {
        await page.setViewportSize({ width, height })
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width)
        const titleLines = await page
          .locator('#landing-title > span')
          .evaluateAll((elements) =>
            elements.map((element) => {
              const range = document.createRange()
              range.selectNodeContents(element)
              return {
                lines: range.getClientRects().length,
                fits:
                  range.getBoundingClientRect().width <=
                  element.clientWidth + 1,
              }
            }),
          )
        expect(titleLines, `${locale} heading at ${width}x${height}`).toEqual([
          { lines: 1, fits: true },
          { lines: 1, fits: true },
        ])
        const invalidLabels = await page
          .locator('main button, main a')
          .evaluateAll((elements) =>
            elements
              .filter((element) => {
                const rect = element.getBoundingClientRect()
                if (!rect.width || !rect.height) return false
                const wrapped = Array.from(element.childNodes).some((node) => {
                  if (
                    node.nodeType !== Node.TEXT_NODE ||
                    !node.textContent?.trim()
                  )
                    return false
                  const range = document.createRange()
                  range.selectNodeContents(node)
                  return range.getClientRects().length > 1
                })
                return (
                  wrapped ||
                  element.scrollWidth > element.clientWidth + 1 ||
                  rect.right > innerWidth + 1
                )
              })
              .map((element) => element.textContent?.trim()),
          )
        expect(invalidLabels, `${locale} at ${width}x${height}`).toEqual([])
      }
    })
  }

  test('a visitor following a protected link is sent to login', async ({
    page,
  }) => {
    for (const path of protectedPaths) {
      await page.goto(path)
      await expect(page).toHaveURL('/login')
    }
  })
})

// Uses the shared authenticated + onboarded session from global.setup.ts.
test('a signed-in user skips the landing and auth pages', async ({ page }) => {
  for (const path of ['/', '/login', '/signup', '/forgot-password']) {
    await page.goto(path)
    await expect(page).toHaveURL('/dashboard')
  }
  await expect(page.getByTestId('dashboard-current-balance')).toBeVisible()
})
