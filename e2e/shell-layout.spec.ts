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
  expect((await page.getByRole('banner').boundingBox())?.y).toBe(0)
  await expect(page.getByRole('navigation')).toBeVisible()
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
]) {
  test(`landing sign in opens inside the app shell at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false)
    await expect(page.getByTestId('landing-preview')).toBeVisible()
    await page.getByTestId('public-sign-in').click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('#app-shell')).toBeVisible()
    await expect(page.locator('[data-public-site]')).toHaveCount(0)
  })
}

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
