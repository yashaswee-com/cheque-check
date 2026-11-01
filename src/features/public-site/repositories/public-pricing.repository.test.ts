import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: { from: vi.fn() },
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
  error: null as Error | null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mocks.client,
}))

import { PublicPricingRepository } from './public-pricing.repository'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows = [
    {
      id: 'lifetime_premium',
      name: 'Lifetime Premium',
      amount: 30000,
      currency: 'INR',
      transaction_type: 'lifetime',
      required_entitlement_id: null,
    },
    {
      id: 'ai_scanner_30d',
      name: 'AI Scanner - 30 days',
      amount: 5000,
      currency: 'INR',
      transaction_type: 'subscription',
      required_entitlement_id: null,
    },
    {
      id: 'hidden_top_up',
      name: 'Subscriber-only top-up',
      amount: 5000,
      currency: 'INR',
      transaction_type: 'top_up',
      required_entitlement_id: 'ai_scanner_sub',
    },
  ]
  mocks.error = null
  const query = {
    select: mocks.select,
    eq: mocks.eq,
    order: mocks.order,
    then: (
      resolve: (value: unknown) => unknown,
      reject: (error: unknown) => unknown,
    ) =>
      Promise.resolve({ data: mocks.rows, error: mocks.error }).then(
        resolve,
        reject,
      ),
  }
  mocks.select.mockReturnValue(query)
  mocks.eq.mockReturnValue(query)
  mocks.order.mockReturnValue(query)
  mocks.client.from.mockReturnValue(query)
})

describe('public pricing repository', () => {
  it('reads active products only and never projects discount or private product metadata', async () => {
    const products = await new PublicPricingRepository().listProducts()

    expect(mocks.client.from).toHaveBeenCalledWith('payment_products')
    expect(mocks.select).toHaveBeenCalledWith(
      'id, name, amount, currency, transaction_type, required_entitlement_id',
    )
    expect(mocks.eq).toHaveBeenCalledWith('active', true)
    expect(products.map(({ id }) => id)).toEqual([
      'lifetime_premium',
      'ai_scanner_30d',
    ])
    expect(products[0]).not.toHaveProperty('discount')
    expect(products[0]).not.toHaveProperty('required_entitlement_id')
  })

  it('does not silently render an empty catalogue after a database failure', async () => {
    mocks.error = new Error('query failed')
    await expect(new PublicPricingRepository().listProducts()).rejects.toThrow(
      'query failed',
    )
  })
})
