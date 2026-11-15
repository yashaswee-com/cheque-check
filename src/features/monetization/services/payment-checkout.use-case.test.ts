import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPaymentCheckout,
  type CheckoutPersistence,
  type CheckoutProvider,
} from './payment-checkout.use-case'

const checkoutId = '90000000-0000-4000-8000-000000000001'
const product = {
  id: 'lifetime_premium',
  name: 'Lifetime Premium',
  transaction_type: 'lifetime',
  feature_id: 'lifetime_premium',
  amount: 30000,
  required_entitlement_id: null,
  is_free: false,
}
const quote = {
  id: checkoutId,
  user_id: '10000000-0000-4000-8000-000000000001',
  product_id: product.id,
  currency: 'INR',
  provider_amount: 19000,
  discount: 6000,
  wallet_amount: 5000,
  provider_order: null,
  status: 'reserved',
}
const input = { userId: 'user-1', productId: 'lifetime_premium' as const }

describe('createPaymentCheckout', () => {
  let persistence: {
    [K in keyof CheckoutPersistence]: ReturnType<
      typeof vi.fn<CheckoutPersistence[K]>
    >
  }
  let provider: {
    createOrder: ReturnType<typeof vi.fn<CheckoutProvider['createOrder']>>
  }
  let dependencies: {
    persistence: typeof persistence
    createProvider: ReturnType<typeof vi.fn<() => CheckoutProvider>>
    randomUUID: ReturnType<typeof vi.fn<() => string>>
    now: () => number
    logError: ReturnType<
      typeof vi.fn<(message: string, error: unknown) => void>
    >
  }

  beforeEach(() => {
    persistence = {
      findProduct: vi.fn().mockResolvedValue(product),
      findActiveEntitlements: vi.fn().mockResolvedValue([]),
      prepareCheckout: vi.fn().mockResolvedValue({ data: quote, error: null }),
      fulfillWalletCheckout: vi.fn().mockResolvedValue(undefined),
      recordOrder: vi.fn().mockResolvedValue(null),
    }
    provider = { createOrder: vi.fn().mockResolvedValue({ id: 'order-1' }) }
    dependencies = {
      persistence,
      createProvider: vi.fn(() => provider),
      randomUUID: vi.fn(() => checkoutId),
      now: () => Date.parse('2026-01-01T00:00:00Z'),
      logError: vi.fn(),
    }
  })

  it('uses the locked paise quote and records the provider order', async () => {
    const result = await createPaymentCheckout(input, dependencies)
    expect(persistence.prepareCheckout).toHaveBeenCalledWith(
      checkoutId,
      input.userId,
      product.id,
    )
    expect(provider.createOrder).toHaveBeenCalledWith({
      amount: 19000,
      currency: 'INR',
      receipt: `cc_${checkoutId}`,
      notes: {
        user_id: input.userId,
        product_id: product.id,
        checkout_id: checkoutId,
      },
    })
    expect(persistence.recordOrder).toHaveBeenCalledWith(checkoutId, 'order-1')
    expect(result).toEqual({
      ok: true,
      order: {
        id: 'order-1',
        amount: 19000,
        currency: 'INR',
        productId: product.id,
        name: product.name,
        discount: 6000,
        walletAmount: 5000,
        walletFunded: false,
      },
    })
  })

  it('uses an existing checkout id and recorded provider order', async () => {
    persistence.prepareCheckout.mockResolvedValue({
      data: { ...quote, provider_order: 'existing' },
      error: null,
    })
    const result = await createPaymentCheckout(
      { ...input, checkoutId },
      dependencies,
    )
    expect(persistence.prepareCheckout).toHaveBeenCalledWith(
      checkoutId,
      input.userId,
      product.id,
    )
    expect(dependencies.randomUUID).not.toHaveBeenCalled()
    expect(dependencies.createProvider).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, order: { id: 'existing' } })
  })

  it('fulfills wallet-only checkouts without initializing the provider', async () => {
    persistence.prepareCheckout.mockResolvedValue({
      data: { ...quote, provider_amount: 0 },
      error: null,
    })
    expect(await createPaymentCheckout(input, dependencies)).toMatchObject({
      ok: true,
      order: {
        id: `wallet_${checkoutId}`,
        walletFunded: true,
        walletAmount: 5000,
      },
    })
    expect(persistence.fulfillWalletCheckout).toHaveBeenCalledWith(checkoutId)
    expect(dependencies.createProvider).not.toHaveBeenCalled()
  })

  it.each(['expired', 'failed', 'refunded'])(
    'does not reopen %s checkouts',
    async (status) => {
      persistence.prepareCheckout.mockResolvedValue({
        data: { ...quote, status },
        error: null,
      })
      expect(await createPaymentCheckout(input, dependencies)).toEqual({
        ok: false,
        failure: { reason: 'closed' },
      })
      expect(dependencies.createProvider).not.toHaveBeenCalled()
      expect(persistence.fulfillWalletCheckout).not.toHaveBeenCalled()
    },
  )

  it('retains the reservation on uncertain provider failure', async () => {
    const error = new Error('network timeout')
    provider.createOrder.mockRejectedValue(error)
    await expect(createPaymentCheckout(input, dependencies)).rejects.toBe(error)
    expect(dependencies.logError).toHaveBeenCalledWith(
      'Provider order creation failed; reservation awaits expiry',
      error,
    )
    expect(persistence.recordOrder).not.toHaveBeenCalled()
    expect(persistence.fulfillWalletCheckout).not.toHaveBeenCalled()
  })

  it('returns quote and recording errors without treating them as success', async () => {
    const error = { code: '23505', message: 'conflict' }
    persistence.prepareCheckout.mockResolvedValueOnce({ data: null, error })
    expect(await createPaymentCheckout(input, dependencies)).toEqual({
      ok: false,
      failure: { reason: 'quote-error', error },
    })
    expect(dependencies.logError).toHaveBeenCalledWith(
      'Payment quote failed',
      error,
    )
    expect(dependencies.createProvider).not.toHaveBeenCalled()
    persistence.recordOrder.mockResolvedValueOnce(error)
    expect(await createPaymentCheckout(input, dependencies)).toEqual({
      ok: false,
      failure: { reason: 'record-error', error },
    })
  })

  it('checks product availability and current entitlements before reserving', async () => {
    persistence.findProduct.mockResolvedValueOnce(null)
    expect(await createPaymentCheckout(input, dependencies)).toMatchObject({
      failure: { reason: 'unavailable' },
    })
    persistence.findActiveEntitlements.mockResolvedValueOnce([
      { feature_id: product.feature_id, valid_until: '2027-01-01T00:00:00Z' },
    ])
    expect(await createPaymentCheckout(input, dependencies)).toMatchObject({
      failure: { reason: 'already-active' },
    })
    persistence.findProduct.mockResolvedValueOnce({
      ...product,
      transaction_type: 'top_up',
      required_entitlement_id: 'subscription',
    })
    persistence.findActiveEntitlements.mockResolvedValueOnce([
      { feature_id: 'subscription', valid_until: '2025-01-01T00:00:00Z' },
    ])
    expect(await createPaymentCheckout(input, dependencies)).toMatchObject({
      failure: { reason: 'entitlement-required' },
    })
    expect(persistence.prepareCheckout).not.toHaveBeenCalled()
  })
})
