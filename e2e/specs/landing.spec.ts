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

  test('shows a shimmer while a lazy image loads and stops on completion', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    let releaseImage!: () => void
    const imageReady = new Promise<void>((resolve) => {
      releaseImage = resolve
    })
    await page.route('**/_next/image?**', async (route) => {
      if (decodeURIComponent(route.request().url()).includes('/reports.png')) {
        await imageReady
      }
      await route.continue()
    })
    try {
      await page.goto('/')
      const image = page.locator('[data-feature="reports"] img')
      const wrapper = image.locator('..')
      await expect(image).toHaveAttribute('loading', 'lazy')
      await image.scrollIntoViewIfNeeded()
      await expect(wrapper).toHaveAttribute('data-image-status', 'loading')
      await expect(wrapper).not.toHaveCSS('animation-name', 'none')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect(wrapper).toHaveCSS('animation-name', 'none')
      releaseImage()
      await expect(wrapper).toHaveAttribute('data-image-status', 'loaded')
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true)
      await expect(wrapper).toHaveCSS('animation-name', 'none')
    } finally {
      releaseImage()
    }
  })

  test('combined accounts and parties card fits the feature layout', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    await page.goto('/')
    const features = page.locator('section[aria-labelledby="features-title"]')
    const scan = features.locator('[data-feature="cheques"]')
    const combined = features.locator('[data-feature="accountsParties"]')
    const image = combined.locator('img')
    await expect(features.locator('article')).toHaveCount(4)
    await expect(combined.getByRole('heading')).toHaveText(
      english.PublicSite.landing.accountsParties,
    )
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await image.scrollIntoViewIfNeeded()
      await expect
        .poll(() =>
          image.evaluate(
            (element: HTMLImageElement) =>
              element.complete && element.naturalWidth > 0,
          ),
        )
        .toBe(true)
      const scanBox = await scan.boundingBox()
      const combinedBox = await combined.boundingBox()
      const imageBox = await image.boundingBox()
      expect(scanBox).not.toBeNull()
      expect(combinedBox).not.toBeNull()
      expect(imageBox).not.toBeNull()
      expect(imageBox!.width).toBeLessThanOrEqual(combinedBox!.width)
      expect(combinedBox!.x + combinedBox!.width).toBeLessThanOrEqual(width)
      if (width >= 1024) {
        expect(Math.abs(scanBox!.y - combinedBox!.y)).toBeLessThan(1)
        expect(combinedBox!.x).toBeGreaterThan(scanBox!.x + scanBox!.width)
      } else {
        expect(combinedBox!.y).toBeGreaterThanOrEqual(
          scanBox!.y + scanBox!.height,
        )
      }
    }
  })

  test('FAQ expands smoothly without moving its trigger or chevron', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const rejectCookies = page.getByRole('button', {
      name: english.PublicSite.cookieConsent.reject,
      exact: true,
    })
    await rejectCookies.click()

    const question = page.getByRole('button', {
      name: english.PublicSite.landing.faq.accountingQuestion,
    })
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 800 })
      await question.evaluate((button) =>
        button.scrollIntoView({ block: 'center' }),
      )
      await question.click()
      await expect(question).toHaveAttribute('aria-expanded', 'true')
      await page.waitForTimeout(300)
      await question.evaluate((button) =>
        button.scrollIntoView({ block: 'center' }),
      )
      const box = await question.boundingBox()
      expect(box).not.toBeNull()
      await page.mouse.move(box!.x + 10, box!.y + box!.height / 2)
      await page.mouse.down()
      await expect(question).toHaveCSS('transform', 'none')
      await page.mouse.up()
      await expect(question).toHaveAttribute('aria-expanded', 'false')
      await page.waitForTimeout(300)

      const animations = await question.evaluate(async (button) => {
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error('FAQ trigger must be a button')
        }
        const answer = document.getElementById(
          button.getAttribute('aria-controls')!,
        )!
        const icon = button.querySelector('svg')!
        const capture = async () => {
          const frames: {
            height: number
            top: number
            x: number
            y: number
          }[] = []
          const sample = () => {
            const buttonRect = button.getBoundingClientRect()
            const iconRect = icon.getBoundingClientRect()
            frames.push({
              height: answer.getBoundingClientRect().height,
              top: buttonRect.top,
              x: iconRect.x + iconRect.width / 2,
              y: iconRect.y + iconRect.height / 2,
            })
          }
          sample()
          button.click()
          const start = performance.now()
          await new Promise<void>((resolve) => {
            const frame = () => {
              sample()
              if (performance.now() - start < 350) requestAnimationFrame(frame)
              else resolve()
            }
            requestAnimationFrame(frame)
          })
          return frames
        }
        return [await capture(), await capture()]
      })
      const openHeight = animations[0].at(-1)!.height
      expect(openHeight).toBeGreaterThan(0)
      for (const [direction, samples] of animations.entries()) {
        expect(
          samples.some(({ height }) => height > 0 && height < openHeight - 1),
        ).toBe(true)
        for (let index = 1; index < samples.length; index++) {
          const delta = samples[index].height - samples[index - 1].height
          expect(direction === 0 ? delta : -delta).toBeGreaterThanOrEqual(-0.5)
          expect(Math.abs(samples[index].top - samples[0].top)).toBeLessThan(1)
          expect(Math.abs(samples[index].x - samples[0].x)).toBeLessThan(1)
          expect(Math.abs(samples[index].y - samples[0].y)).toBeLessThan(1)
        }
      }
      await expect(question).toHaveAttribute('aria-expanded', 'false')
      expect(animations[1].at(-1)!.height).toBe(0)
      await question.click()
      await page.waitForTimeout(70)
      await question.click()
      await expect(question).toHaveAttribute('aria-expanded', 'false')
      await expect
        .poll(() =>
          question.evaluate((button) => {
            const answer = document.getElementById(
              button.getAttribute('aria-controls')!,
            )!
            return answer.getBoundingClientRect().height
          }),
        )
        .toBe(0)
    }

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(question.locator('svg')).toHaveCSS('transition-duration', '0s')
    const answer = page.locator(
      `[id="${await question.getAttribute('aria-controls')}"]`,
    )
    await expect(answer).toHaveCSS('transition-duration', '0s')
    await question.focus()
    await page.keyboard.press('Enter')
    await expect(question).toHaveAttribute('aria-expanded', 'true')
    await expect(answer).not.toHaveAttribute('inert')
    await page.keyboard.press('Space')
    await expect(question).toHaveAttribute('aria-expanded', 'false')
    await expect(answer).toHaveAttribute('inert')
  })

  test('loads the reports image when its section approaches the viewport', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 393, height: 600 })
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    const reportRequests: string[] = []
    page.on('request', (request) => {
      if (
        decodeURIComponent(request.url()).includes(
          '/assets/landing/shots/reports.png',
        )
      ) {
        reportRequests.push(request.url())
      }
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const image = page.locator('[data-feature="reports"] img')
    await expect(image).toHaveAttribute('loading', 'lazy')
    expect(reportRequests).toHaveLength(0)
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        image.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true)
    expect(reportRequests.length).toBeGreaterThan(0)
  })

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

  test('returning from dark signup keeps the public site light', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: 'en', url: baseURL! },
    ])
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page
      .getByRole('link', {
        name: english.PublicSite.landing.primaryCta,
        exact: true,
      })
      .first()
      .click()
    await expect(page).toHaveURL('/signup')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await expect(page.locator('#app-shell')).toHaveCSS(
      'background-color',
      'rgb(0, 0, 0)',
    )

    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
    await expect(page.locator('[data-public-site]')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    )
    await expect
      .poll(() =>
        page
          .locator('html')
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue('--input').trim(),
          ),
      )
      .toBe('#e0e0e0')
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
      await expect(
        page
          .getByText(catalog.PublicSite.landing.noBankConnection, {
            exact: true,
          })
          .first(),
      ).toBeVisible()
      for (const [key, caption] of Object.entries(
        catalog.PublicSite.landing.gallery,
      )) {
        if (!key.endsWith('Caption')) continue
        await expect(
          page.locator('figcaption').filter({ hasText: caption }),
        ).toHaveCount(1)
      }
      await expect(page.locator('main a[href="/signup"]')).toHaveCount(4)
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
      await expect(gallery.locator('figure')).toHaveCount(19)
      await expect(gallery.getByRole('img')).toHaveCount(15)
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
