import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const viewport of [
  { width: 320, height: 480 },
  { width: 390, height: 844 },
  { width: 568, height: 320 },
  { width: 1280, height: 900 },
]) {
  for (const route of ['login', 'signup', 'forgot-password'] as const) {
    test(`${route} is reachable at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.context().addCookies([
        {
          name: 'NEXT_LOCALE',
          value: 'en',
          url: new URL('/', test.info().project.use.baseURL).toString(),
        },
      ])
      await page.goto(`/${route}`)
      const scroll = page.locator('#app-scroll-container')
      const back = page.getByRole('button', { name: 'Back', exact: true })
      await expect(back).toBeVisible()
      await expect(back).toBeInViewport()
      await expect(page.locator('.orientation-overlay')).toBeHidden()
      expect(
        await scroll.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)

      const lastControl =
        route === 'forgot-password'
          ? page.getByTestId('forgot-password-submit-button')
          : page.getByRole('link', {
              name: route === 'login' ? 'Sign Up' : 'Sign In',
              exact: true,
            })
      await lastControl.scrollIntoViewIfNeeded()
      await expect(lastControl).toBeInViewport()
      await back.scrollIntoViewIfNeeded()
      await back.focus()
      await expect(back).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(
        route === 'forgot-password' ? /\/login$/ : /\/$/,
      )
    })
  }
}
