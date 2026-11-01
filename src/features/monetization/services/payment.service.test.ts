import { afterEach, describe, expect, it, vi } from 'vitest'
import { paymentService, PaymentService } from './payment.service'

describe('PaymentService', () => {
  it('reuses a request ID across retries and starts a new ID only after a closed quote', async () => {
    const service = new PaymentService()
    const order = {
      id: 'order',
      amount: 5000,
      currency: 'INR',
      productId: 'ai_scan_250',
      name: 'Top-up',
    }
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(order)))
    await service.createOrder('ai_scan_250')
    await service.createOrder('ai_scan_250')
    const ids = () =>
      fetch.mock.calls.map(
        (call) => JSON.parse(call[1]?.body as string).checkoutId,
      )
    expect(ids()[0]).toBe(ids()[1])
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Closed' }), { status: 410 }),
    )
    await expect(service.createOrder('ai_scan_250')).rejects.toThrow('Closed')
    await service.createOrder('ai_scan_250')
    expect(ids()[3]).not.toBe(ids()[0])
  })
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
      body: expect.any(String),
    })
    const sent = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
    expect(sent).toMatchObject({
      productId: 'lifetime_premium',
      checkoutId: expect.any(String),
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
