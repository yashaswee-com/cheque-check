import { expect, test } from '@playwright/test'

// Uses the shared authenticated + onboarded session from global.setup.ts.
test.describe('locale', () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ]) {
    test(`preference pickers do not shift surrounding fields at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/settings/preferences')
      const pickerIds = [
        'preferences-currency',
        'preferences-language',
        'preferences-date-format',
        'preferences-time-format',
        'preferences-time-zone',
      ]
      await expect(page.getByTestId(pickerIds[0])).toBeVisible()
      await expect(page.getByTestId('monitoring-preference')).toBeAttached()

      const fields = page.locator('[data-slot="popover-trigger"]')
      const measure = () =>
        fields.evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            }
          }),
        )

      for (const id of pickerIds) {
        const picker = page.getByTestId(id)
        await picker.scrollIntoViewIfNeeded()
        const before = await measure()
        await picker.click()
        await expect(page.getByTestId(`${id}-search`)).toBeVisible()
        await expect
          .poll(async () => {
            const after = await measure()
            return Math.max(
              ...after.flatMap((rect, index) =>
                (['x', 'y', 'width', 'height'] as const).map((key) =>
                  Math.abs(rect[key] - before[index][key]),
                ),
              ),
            )
          })
          .toBeLessThanOrEqual(0.5)
        await page.keyboard.press('Escape')
        await expect(page.getByTestId(`${id}-search`)).not.toBeVisible()
        await expect.poll(measure).toEqual(before)
      }
    })
  }

  test('switching to Hindi translates the UI and persists across a reload', async ({
    page,
  }) => {
    await page.goto('/settings/preferences')
    const language = page.getByTestId('preferences-language')
    if (!(await language.innerText()).includes('English')) {
      await language.click()
      await page.getByRole('option', { name: 'English' }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    }

    await language.click()
    await page.getByRole('option', { name: 'Hindi' }).click()

    // Language switch sets a cookie + calls window.location.reload().
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi')
    await page.goto('/dashboard')
    await expect(page.getByTestId('bottom-nav-parties')).toContainText(
      'पार्टियाँ',
    )

    await page.reload()
    await expect(page.getByTestId('bottom-nav-parties')).toContainText(
      'पार्टियाँ',
    )

    await page.goto('/settings/preferences')
    await language.click()
    await page.getByRole('option', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.goto('/dashboard')
    await expect(page.getByTestId('bottom-nav-parties')).toContainText(
      'Parties',
    )
  })
})
