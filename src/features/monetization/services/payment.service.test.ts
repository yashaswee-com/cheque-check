import { afterEach, describe, expect, it, vi } from 'vitest'
import { paymentService } from './payment.service'

describe('PaymentService', () => {
  it.each([null, 'unavailable', {}, { message: 'unavailable' }])(
    'uses a safe error when the server does not return an error property: %j',
    async (body) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), { status: 503 }),
      )
      await expect(
        paymentService.createOrder('lifetime_premium'),
      ).rejects.toThrow('Unable to create payment order')
    },
  )

  it('preserves non-method property access on the lazy service', () => {
    expect(Reflect.get(paymentService, 'missing')).toBeUndefined()
  })

  it('rejects an invalid success-shaped provider response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '',
          amount: -1,
          currency: 'USD',
          productId: 'unknown',
          name: '',
        }),
      ),
    )
    await expect(
      paymentService.createOrder('lifetime_premium'),
    ).rejects.toThrow()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a payment order via the API contract', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'order_123',
        amount: 19900,
        currency: 'INR',
        productId: 'lifetime_premium',
        name: 'Lifetime Premium',
      }),
    } as Response)

    const result = await paymentService.createOrder('lifetime_premium')

    expect(fetchSpy).toHaveBeenCalledWith('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'lifetime_premium' }),
    })
    expect(result).toEqual({
      id: 'order_123',
      amount: 19900,
      currency: 'INR',
      productId: 'lifetime_premium',
      name: 'Lifetime Premium',
    })
  })

  it('throws the server error when order creation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Payment product is unavailable' }),
    } as Response)

    await expect(
      paymentService.createOrder('lifetime_premium'),
    ).rejects.toThrow('Payment product is unavailable')
  })
})
