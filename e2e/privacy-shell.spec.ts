import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

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
