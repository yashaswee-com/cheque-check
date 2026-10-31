import { describe, expect, it } from 'vitest'
import {
  ALL_PRODUCT_IDS,
  ProductIdSchema,
} from '@/features/monetization/constants'
import {
  CreatePaymentOrderSchema,
  PaymentOrderSchema,
  PaymentProductIdSchema,
} from './payments'

describe('payment validation contracts', () => {
  it('uses the canonical product catalog without a separate allowlist', () => {
    expect(PaymentProductIdSchema).toBe(ProductIdSchema)
  })

  it.each(ALL_PRODUCT_IDS)(
    'accepts orders for catalog product %s',
    (productId) => {
      expect(CreatePaymentOrderSchema.parse({ productId })).toEqual({
        productId,
      })
      const order = {
        id: 'order_123',
        amount: 1,
        currency: 'INR',
        productId,
        name: 'Payment',
      }
      expect(PaymentOrderSchema.parse(order)).toEqual(order)
    },
  )

  it.each([undefined, null, '', 'unknown', 'AI_SCAN_250', 250])(
    'rejects unsupported product identifiers %j',
    (productId) => {
      expect(CreatePaymentOrderSchema.safeParse({ productId }).success).toBe(
        false,
      )
    },
  )

  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 1.5 },
    { amount: NaN },
    { amount: Infinity },
    { amount: '100' },
    { currency: 'USD' },
    { currency: 'inr' },
    { id: '' },
    { id: null },
    { name: '' },
    { name: null },
    { productId: 'unknown' },
  ])('rejects malformed provider orders %j', (overrides) => {
    expect(
      PaymentOrderSchema.safeParse({
        id: 'order_123',
        amount: 100,
        currency: 'INR',
        productId: ALL_PRODUCT_IDS[0],
        name: 'Payment',
        ...overrides,
      }).success,
    ).toBe(false)
  })

  it('strips untrusted properties rather than exposing provider metadata', () => {
    expect(
      CreatePaymentOrderSchema.parse({
        productId: ALL_PRODUCT_IDS[0],
        amount: 1,
        userId: 'other-user',
      }),
    ).toEqual({ productId: ALL_PRODUCT_IDS[0] })
    expect(
      PaymentOrderSchema.parse({
        id: 'order_123',
        amount: 100,
        currency: 'INR',
        productId: ALL_PRODUCT_IDS[0],
        name: 'Payment',
        secret: 'not-forwarded',
      }),
    ).not.toHaveProperty('secret')
  })
})
