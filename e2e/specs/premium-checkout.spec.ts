import { expect, test, type Page } from '@playwright/test'

type CheckoutOptions = { order_id: string; amount: number; currency: string }

/** Replaces the Razorpay checkout with a stub the user immediately closes. */
async function stubRazorpayCheckout(page: Page) {
  await page.route('https://checkout.razorpay.com/**', (route) => route.abort())
  await page.addInitScript(() => {
    const opened: unknown[] = []
    Object.defineProperty(window, '__e2eCheckouts', { value: opened })
    Object.defineProperty(window, 'Razorpay', {
      configurable: true,
      value: function (options: { modal: { ondismiss: () => void } }) {
        return {
          open() {
            opened.push(options)
            setTimeout(() => options.modal.ondismiss(), 0)
          },
        }
      },
    })
  })
}

// Uses the shared free user; order creation and checkout are intercepted, so no
// payment is attempted and the plan does not change.
test.describe('premium checkout', () => {
  test('an owner opens checkout for Premium and closes it without paying', async ({
    page,
  }) => {
    await stubRazorpayCheckout(page)
    const orderRequests: unknown[] = []
    await page.route('**/api/payments/create-order', async (route) => {
      orderRequests.push(route.request().postDataJSON())
      await route.fulfill({
        json: {
          id: 'order_e2e_lifetime',
          amount: 49900,
          currency: 'INR',
          productId: 'lifetime_premium',
          name: 'Premium - Lifetime',
        },
      })
    })

    await page.goto('/features')
    const buy = page.getByRole('button', { name: 'Get Premium - Lifetime' })
    await buy.click()

    await expect
      .poll(() => orderRequests)
      .toEqual([{ productId: 'lifetime_premium' }])
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __e2eCheckouts: CheckoutOptions[] })
              .__e2eCheckouts,
        ),
      )
      .toEqual([
        expect.objectContaining({
          order_id: 'order_e2e_lifetime',
          amount: 49900,
          currency: 'INR',
        }),
      ])
    await expect(buy).toBeEnabled()

    await page.goto('/reports')
    await expect(page.getByTestId('reports-premium-gate')).toBeVisible()
  })

  test('a failed order is explained and the owner can try again', async ({
    page,
  }) => {
    await stubRazorpayCheckout(page)
    await page.route('**/api/payments/create-order', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Payments are temporarily unavailable' },
      }),
    )
    let alertMessage = ''
    page.on('dialog', (dialog) => {
      alertMessage = dialog.message()
      void dialog.accept()
    })

    await page.goto('/features')
    const buy = page.getByRole('button', { name: 'Get Premium - Lifetime' })
    await buy.click()

    await expect
      .poll(() => alertMessage)
      .toBe('Payments are temporarily unavailable')
    await expect(buy).toBeEnabled()
  })
})
