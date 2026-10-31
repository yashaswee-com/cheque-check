import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TABLES } from '@/lib/supabase/tables'
import { PRODUCT_IDS } from '@/features/monetization/constants'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  getUser: vi.fn(),
  rateLimitRpc: vi.fn(),
  adminRpc: vi.fn(),
  from: vi.fn(),
  getRazorpayEnv: vi.fn(),
  createOrder: vi.fn(),
  razorpayConstructor: vi.fn(),
  setRequestUser: vi.fn(),
  withMonitoringRequest: vi.fn(),
  error: vi.fn(),
  product: null as unknown,
  entitlements: [] as unknown[],
  productError: null as unknown,
  entitlementError: null as unknown,
  recordError: null as unknown,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/env/server', () => ({
  getRazorpayEnv: mocks.getRazorpayEnv,
}))

vi.mock('@/lib/monitoring/server', () => ({
  setRequestUser: mocks.setRequestUser,
  withMonitoringRequest: mocks.withMonitoringRequest,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.error },
}))

vi.mock('razorpay', () => ({
  default: class Razorpay {
    orders = { create: mocks.createOrder }
    constructor(options: unknown) {
      mocks.razorpayConstructor(options)
    }
  },
}))

const user = { id: 'user-12345678' }

function request(body: string) {
  return new Request('https://app.test/api/payments/create-order', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeQuery(data: unknown, getError: () => unknown) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data, error: getError() })),
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data, error: getError() }).then(resolve, reject),
  }
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.product = {
    id: PRODUCT_IDS.LIFETIME_PREMIUM,
    name: 'Lifetime Premium',
    transaction_type: 'lifetime',
    feature_id: 'lifetime_premium',
    amount: 19900,
    currency: 'INR',
    required_entitlement_id: null,
  }
  mocks.entitlements = []
  mocks.productError = null
  mocks.entitlementError = null
  mocks.recordError = null

  const productQuery = makeQuery(mocks.product, () => mocks.productError)
  const entitlementsQuery = makeQuery(
    mocks.entitlements,
    () => mocks.entitlementError,
  )

  mocks.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.rateLimitRpc.mockResolvedValue({ data: true, error: null })
  mocks.adminRpc.mockImplementation(async () => ({ error: mocks.recordError }))
  mocks.from.mockImplementation((table: string) =>
    table === TABLES.PAYMENT_PRODUCTS ? productQuery : entitlementsQuery,
  )
  mocks.createClient.mockResolvedValue({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rateLimitRpc,
  })
  mocks.createAdminClient.mockReturnValue({
    from: mocks.from,
    rpc: mocks.adminRpc,
  })
  mocks.getRazorpayEnv.mockReturnValue({
    RAZORPAY_KEY_ID: 'key_id',
    RAZORPAY_KEY_SECRET: 'key_secret',
  })
  mocks.createOrder.mockResolvedValue({ id: 'order-1' })
  mocks.withMonitoringRequest.mockImplementation(
    async (
      _request: Request,
      _operation: string,
      handler: () => Promise<Response>,
    ) => handler(),
  )
})

describe('payment order route', () => {
  it.each(['rate', 'entitlements'])(
    'logs %s database failures without creating an order',
    async (stage) => {
      const error = new Error('database offline')
      if (stage === 'rate')
        mocks.rateLimitRpc.mockResolvedValueOnce({ data: null, error })
      else mocks.entitlementError = error
      const response = await POST(
        request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
      )
      expect(response.status).toBe(500)
      expect(mocks.createOrder).not.toHaveBeenCalled()
      expect(mocks.error).toHaveBeenCalledWith(
        'Failed to create payment order',
        error,
      )
    },
  )

  it('handles an empty entitlement response and an absent product without a query error', async () => {
    mocks.from.mockImplementation((table: string) =>
      table === TABLES.PAYMENT_PRODUCTS
        ? makeQuery(mocks.product, () => null)
        : makeQuery(null, () => null),
    )
    expect(
      (
        await POST(
          request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
        )
      ).status,
    ).toBe(200)
    mocks.product = null
    expect(
      (
        await POST(
          request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
        )
      ).status,
    ).toBe(404)
  })
  it('rejects invalid JSON and unknown products before authentication', async () => {
    const invalidJson = await POST(request('{'))
    expect(invalidJson.status).toBe(400)
    expect(await invalidJson.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.createClient).not.toHaveBeenCalled()

    const invalidProduct = await POST(
      request(JSON.stringify({ productId: 'x' })),
    )
    expect(invalidProduct.status).toBe(400)
    expect(await invalidProduct.json()).toEqual({
      error: 'Invalid payment product',
    })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires authentication before applying rate limits', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.rateLimitRpc).not.toHaveBeenCalled()
  })

  it('returns retry metadata when payment order creation is rate limited', async () => {
    mocks.rateLimitRpc.mockResolvedValue({ data: false, error: null })

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('returns not found for an unavailable product', async () => {
    mocks.product = null
    mocks.from.mockImplementation((table: string) =>
      table === TABLES.PAYMENT_PRODUCTS
        ? makeQuery(null, () => ({ message: 'not found' }))
        : makeQuery([], () => null),
    )

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Payment product is unavailable',
    })
  })

  it('rejects products whose entitlement is already active', async () => {
    mocks.entitlements = [
      {
        feature_id: 'lifetime_premium',
        status: 'active',
        valid_until: null,
      },
    ]
    mocks.from.mockImplementation((table: string) =>
      table === TABLES.PAYMENT_PRODUCTS
        ? makeQuery(mocks.product, () => null)
        : makeQuery(mocks.entitlements, () => null),
    )

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: 'This product is already active',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('requires the subscription entitlement for a top-up product', async () => {
    mocks.product = {
      ...(mocks.product as object),
      id: PRODUCT_IDS.AI_SCAN_250,
      transaction_type: 'top_up',
      feature_id: 'ai_scan',
      required_entitlement_id: 'ai_scanner_sub',
    }
    mocks.from.mockImplementation((table: string) =>
      table === TABLES.PAYMENT_PRODUCTS
        ? makeQuery(mocks.product, () => null)
        : makeQuery([], () => null),
    )

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.AI_SCAN_250 })),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'An active subscription is required for this top-up',
    })
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })

  it('creates an order, records it, and returns the catalog product data', async () => {
    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'order-1',
      amount: 19900,
      currency: 'INR',
      productId: PRODUCT_IDS.LIFETIME_PREMIUM,
      name: 'Lifetime Premium',
    })
    expect(mocks.razorpayConstructor).toHaveBeenCalledWith({
      key_id: 'key_id',
      key_secret: 'key_secret',
    })
    expect(mocks.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 19900,
        currency: 'INR',
        notes: {
          user_id: user.id,
          product_id: PRODUCT_IDS.LIFETIME_PREMIUM,
        },
      }),
    )
    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'record_payment_order',
      expect.objectContaining({
        order_user_id: user.id,
        requested_product_id: PRODUCT_IDS.LIFETIME_PREMIUM,
        razorpay_order: 'order-1',
      }),
    )
  })

  it.each([
    ['23505', 409],
    ['XX000', 500],
  ])('maps order-recording error %s to HTTP %i', async (code, status) => {
    mocks.recordError = { code, message: 'Could not record order' }

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error: 'Could not record order' })
  })

  it('logs unexpected provider and Supabase errors', async () => {
    const error = new Error('Razorpay unavailable')
    mocks.createOrder.mockRejectedValue(error)

    const response = await POST(
      request(JSON.stringify({ productId: PRODUCT_IDS.LIFETIME_PREMIUM })),
    )

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Unable to create payment order',
    })
    expect(mocks.error).toHaveBeenCalledWith(
      'Failed to create payment order',
      error,
    )
  })
})
