import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'

test.use({ storageState: { cookies: [], origins: [] } })

for (const width of [320, 390, 1280]) {
  test(`shared theme picker fits a single row at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    // Playwright transforms JSX into descriptors; use the existing tsx runner to render real React.
    const markup = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `
          import { createElement } from 'react';
          import { renderToStaticMarkup } from 'react-dom/server';
          import { PARTY_THEME_COLORS, ThemeColorRow } from './src/components/ui/theme-color-row.tsx';
          process.stdout.write(renderToStaticMarkup(createElement(ThemeColorRow, {
            label: 'Theme color', colors: PARTY_THEME_COLORS, value: '#007AFF',
            onChange: () => {}, testId: 'theme-picker-layout',
          })));
        `,
      ],
      { encoding: 'utf8' },
    )
    await page.evaluate(
      ({ markup, contentWidth }) => {
        const host = document.createElement('div')
        host.style.cssText = `position:fixed;top:0;left:0;z-index:9999;width:${contentWidth}px`
        host.innerHTML = markup
        document.body.append(host)
      },
      { markup, contentWidth: Math.min(width, 460) - 32 },
    )
    const row = page.getByTestId('theme-picker-layout').getByRole('group')
    const rowBox = await row.boundingBox()
    expect(rowBox).not.toBeNull()
    const buttons = row.getByRole('button')
    await expect(buttons).toHaveCount(7)
    let previousRight = 0
    let centerY: number | undefined
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!
      centerY ??= box.y + box.height / 2
      expect(box.y + box.height / 2).toBeCloseTo(centerY, 0)
      expect(box.x).toBeGreaterThanOrEqual(previousRight)
      expect(box.x + box.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width)
      expect(box.height).toBeCloseTo(box.width, 0)
      previousRight = box.x + box.width
    }
    expect(
      await row.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
  })
}

test('public navigation stays visible while its page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/features')
  await page.evaluate(() => window.scrollTo(0, 600))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const qaHeight = (await page.getByTestId('qa-indicator').count()) ? 8 : 0
  expect((await page.getByRole('banner').boundingBox())?.y).toBe(12 + qaHeight)
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await page.getByRole('button', { name: /navigation/i }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('navigation')).toHaveCount(0)
})

test('floating header sign-in opens the authentication app shell', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByRole('banner').locator('a[href="/login"]').click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.locator('#app-shell')).toBeVisible()
  await expect(page.locator('[data-public-site]')).toHaveCount(0)
})

for (const viewport of [
  { width: 320, height: 667 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1280, height: 900 },
]) {
  test(`public landing fits and works at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    await expect(page.locator('h1')).toHaveText(
      'Cheque ki date yaad nahi?Ab yaad rakhni bhi nahi.',
    )
    const heroCta = page.locator('main a[href="/signup"]').first()
    await expect(heroCta).toBeInViewport()
    expect(
      await heroCta.evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44)
    const preview = await page.locator('#product-demo video').boundingBox()
    expect(preview).not.toBeNull()
    expect(preview!.y).toBeLessThan(viewport.height - 80)
    expect(preview!.width / preview!.height).toBeCloseTo(9 / 16, 2)
    await expect(page.locator('#product-demo button')).toHaveCount(1)
    await expect(page.locator('#product-demo video')).not.toHaveAttribute('src')
    await expect(page.getByRole('banner').getByRole('link')).toHaveCount(2)
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Cheque Check' }),
    ).toHaveAccessibleName('Cheque Check')
    const signIn = page.getByRole('banner').locator('a[href="/login"]')
    await expect(signIn).toHaveAttribute('data-app-entry', 'true')
    await expect(signIn.locator('svg')).toHaveCount(1)
    const header = page.getByRole('banner')
    expect((await header.boundingBox())!.x).toBeGreaterThan(0)
    expect(
      await header.evaluate((el) => getComputedStyle(el).borderRadius),
    ).toBe('18px')
    expect(
      await page
        .getByText('Pehle 100 naye users ko 3 mahine Premium free')
        .evaluate((el) => getComputedStyle(el).borderRadius),
    ).toBe('9999px')
    const iconBacking = await page
      .locator('[data-feature="cheques"] [class*="toneIcon"]')
      .first()
      .evaluate((el) => {
        return getComputedStyle(el, '::before').content
      })
    expect(iconBacking).toBe('none')
    const featureIconStyle = await page
      .locator('[data-feature="cheques"] [class*="featureIcon"]')
      .evaluate((el) => ({
        border: getComputedStyle(el).borderTopWidth,
        background: getComputedStyle(el).backgroundColor,
      }))
    expect(featureIconStyle).toEqual({
      border: '0px',
      background: 'rgba(0, 0, 0, 0)',
    })
    expect(
      await header.evaluate((el) => getComputedStyle(el).borderTopWidth),
    ).toBe('0px')
    expect(
      await header
        .getByRole('link', { name: 'Cheque Check' })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(0, 0, 0)')
    expect(
      await page
        .locator('html')
        .evaluate((el) => getComputedStyle(el).overscrollBehavior),
    ).toBe('none')
    expect(
      await page
        .locator('body')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(255, 255, 255)')
    await expect(
      page.getByText('Awaaz waala demo: captions abhi available nahi hain.'),
    ).toHaveCount(0)
    const headlineFont = await page
      .locator('h1')
      .evaluate((el) => getComputedStyle(el).fontFamily)
    const bodyFont = await page
      .locator('main p')
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily)
    expect(headlineFont.toLowerCase()).toContain('manrope')
    expect(bodyFont.toLowerCase()).toContain('ibm')
    expect(
      await page
        .locator('main a[href="/signup"]')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundImage),
    ).toContain('linear-gradient')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /user-scalable=yes/,
    )
    await page.getByRole('button', { name: 'Main navigation' }).click()
    const menuBoxFull = await page.getByRole('dialog').boundingBox()
    const headerBox = await page.getByRole('banner').boundingBox()
    expect(menuBoxFull!.x).toBeCloseTo(headerBox!.x, 0)
    expect(menuBoxFull!.y).toBeCloseTo(headerBox!.y, 0)
    expect(menuBoxFull!.width).toBeCloseTo(headerBox!.width, 0)
    const nav = page.getByRole('navigation')
    await expect(nav.getByRole('link')).toHaveCount(5)
    const menuBox = await nav.boundingBox()
    expect(menuBox!.x).toBeGreaterThanOrEqual(0)
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width)
    await expect(
      page.getByRole('dialog').locator('a[href="/signup"], a[href="/login"]'),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Menu band karein' })
      .scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Menu band karein' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Main navigation' }),
    ).toBeFocused()
    await page.getByRole('button', { name: 'Main navigation' }).click()
    await page.keyboard.press('Escape')
    await page
      .getByText('Kya cheque bounce hone se guarantee ke saath bachaata hai?')
      .click()
    await expect(page.locator('details[open]')).toHaveCount(1)
    await page.getByTestId('landing-final-cta').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('landing-final-cta')).toBeInViewport()
    if (viewport.width < 736) {
      const carousel = page.getByRole('region', {
        name: 'Aur scenarios dekhne ke liye swipe karein',
      })
      await carousel.scrollIntoViewIfNeeded()
      expect(
        await carousel.evaluate((el) =>
          Math.abs(el.clientWidth - el.parentElement!.clientWidth),
        ),
      ).toBeLessThanOrEqual(1)
      await carousel.focus()
      await page.keyboard.press('ArrowRight')
      await expect
        .poll(() => carousel.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(0)
      const scroller = page.locator('[class*="scenarioScroller"]')
      await expect(
        scroller.getByRole('button', { name: 'Baayin taraf scroll karein' }),
      ).toBeVisible()
      expect(
        await scroller
          .getByRole('button', { name: 'Baayin taraf scroll karein' })
          .evaluate((el) => getComputedStyle(el).position),
      ).toBe('absolute')
      await scroller
        .getByRole('button', { name: 'Daayin taraf scroll karein' })
        .click()
    }
  })
}

for (const locale of [
  {
    value: 'en',
    heading: 'Your business needs you. Your cheques need a system.',
  },
  {
    value: 'hi',
    heading: 'चेक की तारीख याद नहीं? अब याद रखनी भी नहीं।',
  },
]) {
  test(`public landing switches to ${locale.value} and keeps the mobile layout`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 667 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Reject', exact: true }).click()
    await page.getByRole('button', { name: 'Main navigation' }).click()
    await page
      .getByRole('combobox', { name: 'Bhasha' })
      .selectOption(locale.value)
    await expect(page.locator('h1')).toHaveAccessibleName(locale.heading)
    await expect(page.locator('html')).toHaveAttribute('lang', locale.value)
    await expect(
      page.locator('main a[href="/signup"]').first(),
    ).toBeInViewport()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320)
    await page.reload()
    await expect(page.locator('h1')).toHaveAccessibleName(locale.heading)
  })
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`landing signup opens inside the app shell at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false)
    await expect(page.getByTestId('landing-video')).toBeVisible()
    await page.locator('main a[href="/signup"]').first().click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(page.locator('#app-shell')).toBeVisible()
    await expect(page.locator('[data-public-site]')).toHaveCount(0)
    expect(
      await page
        .locator('body')
        .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase()),
    ).toContain('ibm')
    expect(
      await page
        .locator('h1')
        .first()
        .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase()),
    ).toContain('manrope')
  })
}

test('public navigation keeps its light blue palette under a saved dark theme', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.getByRole('button', { name: 'Main navigation' }).click()
  const picker = page.getByRole('combobox', { name: 'Bhasha' })
  const colors = await picker.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      color: style.color,
      background: style.backgroundColor,
      scheme: style.colorScheme,
    }
  })

  expect(colors).toEqual({
    color: 'rgb(0, 102, 204)',
    background: 'rgb(255, 255, 255)',
    scheme: 'light',
  })
  for (const link of await page
    .getByRole('navigation')
    .getByRole('link')
    .all()) {
    await expect(link.locator('svg')).toHaveCount(2)
  }
  expect(
    await page
      .getByRole('dialog')
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(255, 255, 255)')
})

test('public landing loads media only on interaction and plays the supplied recordings', async ({
  page,
}) => {
  const mediaRequests: string[] = []
  page.on('request', (request) => {
    if (/\/assets\/(ad\.mp4|voice-reminder\.mp3)/.test(request.url()))
      mediaRequests.push(request.url())
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const video = page.locator('#product-demo video')
  const audio = page.locator('audio')
  await expect(video).not.toHaveAttribute('src')
  await expect(audio).not.toHaveAttribute('src')
  expect(mediaRequests).toEqual([])
  await page.getByRole('button', { name: 'App demo chalaayein' }).click()
  await expect(video).toHaveAttribute('src', '/assets/ad.mp4')
  await expect(video).toHaveAttribute('controls', '')
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
    .toBeGreaterThan(0)
  await video.evaluate((el: HTMLVideoElement) => el.pause())
  await page.getByRole('button', { name: 'Reminder recording sunein' }).click()
  await expect(audio).toHaveAttribute('src', '/assets/voice-reminder.mp3')
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Reminder recording rokein' }).click()
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused))
    .toBe(true)
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
  expect(mediaRequests.some((url) => url.endsWith('ad.mp4'))).toBe(true)
  expect(mediaRequests.some((url) => url.endsWith('voice-reminder.mp3'))).toBe(
    true,
  )
})

test('industry marquee moves, pauses, and respects reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const track = page.getByTestId('industry-marquee')
  const transform = () => track.evaluate((el) => getComputedStyle(el).transform)
  const initial = await transform()
  await expect.poll(transform).not.toBe(initial)
  await page.getByRole('button', { name: 'Chalti list rokein' }).click()
  expect(
    await track.evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe('paused')
  const pausedTransform = await transform()
  await track.evaluate(async () => {
    for (let frame = 0; frame < 5; frame++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      )
    }
  })
  expect(await transform()).toBe(pausedTransform)
  await page.getByRole('button', { name: 'List phir chalaayein' }).click()
  await page.mouse.move(0, 0)
  await page.locator('h1').click()
  expect(
    await track.evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe('running')
  await track.locator('..').hover()
  expect(
    await track.evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe('paused')
  await page.mouse.move(0, 0)
  await track.locator('..').focus()
  expect(
    await track.evaluate((el) => getComputedStyle(el).animationPlayState),
  ).toBe('paused')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  )
  await expect(
    page.getByRole('button', { name: 'Chalti list rokein' }),
  ).toHaveCount(0)
  await expect(track.locator('ul[aria-hidden="true"]')).toBeHidden()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-reduce-motion', ''),
  )
  expect(await track.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    'none',
  )
  await expect(track.locator('ul[aria-hidden="true"]')).toBeHidden()
})

for (const viewport of [
  { width: 390, height: 900 },
  { width: 1280, height: 900 },
  { width: 1280, height: 1400 },
]) {
  test(`privacy cover matches the anonymous app frame at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/login')
    await page.bringToFront()
    const cover = page.getByTestId('privacy-cover')
    await expect(cover).toBeAttached()
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(cover).toBeVisible()

    const shell = page.locator('#app-shell')
    const frame = page.getByTestId('privacy-cover-frame')
    const shellBox = await shell.boundingBox()
    expect(await frame.boundingBox()).toEqual(shellBox)
    expect(shellBox?.height).toBeLessThanOrEqual(932)
    const styles = await page.evaluate(() => {
      const shell = document.getElementById('app-shell')!
      const cover = document.querySelector<HTMLElement>(
        '[data-testid="privacy-cover"]',
      )!
      const frame = document.querySelector<HTMLElement>(
        '[data-testid="privacy-cover-frame"]',
      )!
      return {
        surround: getComputedStyle(document.body).backgroundColor,
        coverSurround: getComputedStyle(cover).backgroundColor,
        shellRadius: getComputedStyle(shell).borderRadius,
        coverRadius: getComputedStyle(frame).borderRadius,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    expect(styles.coverSurround).toBe(styles.surround)
    expect(styles.coverRadius).toBe(styles.shellRadius)
    expect(styles.overflow).toBe(false)

    await page.evaluate(() => document.documentElement.classList.add('dark'))
    await expect(frame).toHaveCSS('background-color', 'rgb(0, 0, 0)')
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    await expect(frame).toHaveCSS('background-color', 'rgb(255, 255, 255)')

    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(cover).toBeHidden()
  })
}
