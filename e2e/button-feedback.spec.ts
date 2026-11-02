import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('shared buttons replay click shimmer without layout shifts and honor reduced motion', async ({
  page,
}) => {
  await page.goto('/login')
  const button = page.getByTestId('login-submit-button')
  if (!(await button.count())) {
    await page.getByTestId('login-toggle-phone-button').click()
  }
  await expect(button).toBeVisible()
  const box = await button.boundingBox()
  const label = await button.innerText()
  const shimmer = button.locator('[data-slot="button-shimmer"]')

  // Empty required fields prevent any authentication or provider side effects.
  await button.click()
  await expect(shimmer).toBeVisible()
  await expect(shimmer.locator('span')).toHaveCSS(
    'animation-name',
    'button-click-sweep',
  )
  expect(await button.boundingBox()).toEqual(box)
  await expect(button).toHaveText(label)
  await expect(shimmer).toHaveCount(0)

  await button.focus()
  await page.keyboard.press('Enter')
  await expect(shimmer).toBeVisible()
  await expect(shimmer).toHaveCount(0)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await button.click()
  await expect(shimmer).toBeAttached()
  await expect(shimmer).toBeHidden()
  await expect(shimmer).toHaveCount(0)

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() =>
    document.documentElement.setAttribute('data-reduce-motion', ''),
  )
  await button.click()
  await expect(shimmer).toBeAttached()
  await expect(shimmer).toBeHidden()
  await expect(shimmer).toHaveCount(0)
})
