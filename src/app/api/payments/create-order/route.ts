import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { getRazorpayEnv } from '@/lib/env/server'
import { CreatePaymentOrderSchema } from '@/lib/payments'
import { logger } from '@/lib/logger'
import { TABLES } from '@/lib/supabase/tables'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { isEntitlementCurrent } from '@/features/monetization/lib/premium-access'
import { paymentCheckoutSchema } from '@/validators/payment-checkout'

async function createPaymentOrder(request: Request) {
  try {
    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const requestResult = CreatePaymentOrderSchema.safeParse(requestBody)
    if (!requestResult.success) {
      return NextResponse.json(
        { error: 'Invalid payment product' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    setRequestUser(user)

    const { data: rateAllowed, error: rateError } = await supabase.rpc(
      'consume_api_rate_limit',
      {
        requested_endpoint: 'payment-order',
        request_limit: 5,
        window_seconds: 60,
      },
    )
    if (rateError) throw rateError
    if (!rateAllowed) {
      return NextResponse.json(
        { error: 'Too many payment requests. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }

    const admin = createAdminClient()
    const { data: productData, error: productError } = await admin
      .from(TABLES.PAYMENT_PRODUCTS)
      .select(
        'id, name, transaction_type, feature_id, amount, currency, required_entitlement_id',
      )
      .eq('id', requestResult.data.productId)
      .eq('active', true)
      .single()

    if (productError || !productData) {
      return NextResponse.json(
        { error: 'Payment product is unavailable' },
        { status: 404 },
      )
    }
    const product = productData

    const { data: entitlements, error: entitlementError } = await admin
      .from(TABLES.USER_ENTITLEMENTS)
      .select('feature_id, status, valid_until')
      .eq('user_id', user.id)
      .eq('status', 'active')

    if (entitlementError) throw entitlementError

    const activeEntitlements = new Set(
      (entitlements ?? [])
        .filter((entitlement) =>
          isEntitlementCurrent(entitlement.valid_until, Date.now()),
        )
        .map((entitlement) => entitlement.feature_id),
    )

    if (
      (product.transaction_type === 'lifetime' ||
        product.transaction_type === 'subscription') &&
      activeEntitlements.has(product.feature_id)
    ) {
      return NextResponse.json(
        { error: 'This product is already active' },
        { status: 409 },
      )
    }

    if (
      product.required_entitlement_id &&
      !activeEntitlements.has(product.required_entitlement_id)
    ) {
      return NextResponse.json(
        { error: 'An active subscription is required for this top-up' },
        { status: 403 },
      )
    }

    const checkoutId = requestResult.data.checkoutId ?? crypto.randomUUID()
    const { data: quoteData, error: quoteError } = await admin.rpc(
      'prepare_payment_checkout',
      {
        requested_id: checkoutId,
        requested_user: user.id,
        requested_product: product.id,
      },
    )
    if (quoteError) {
      logger.error('Payment quote failed', quoteError)
      return NextResponse.json(
        { error: quoteError.message },
        {
          status:
            quoteError.code === '23505'
              ? 409
              : quoteError.code === '42501'
                ? 403
                : 500,
        },
      )
    }
    const quote = paymentCheckoutSchema.parse(quoteData)
    if (
      quote.status === 'expired' ||
      quote.status === 'failed' ||
      quote.status === 'refunded'
    )
      return NextResponse.json(
        { error: 'Checkout expired or closed. Start a new checkout.' },
        { status: 410 },
      )
    const response = (id: string, walletFunded = false) =>
      NextResponse.json({
        id,
        amount: quote.provider_amount,
        currency: quote.currency,
        productId: product.id,
        name: product.name,
        discount: quote.discount,
        walletAmount: quote.wallet_amount,
        walletFunded,
      })
    if (quote.provider_amount === 0) {
      const { error } = await admin.rpc('fulfill_wallet_checkout', {
        requested_id: quote.id,
      })
      if (error) throw error
      return response(`wallet_${quote.id}`, true)
    }
    if (quote.provider_order) return response(quote.provider_order)
    const razorpayEnv = getRazorpayEnv()
    const razorpay = new Razorpay({
      key_id: razorpayEnv.RAZORPAY_KEY_ID,
      key_secret: razorpayEnv.RAZORPAY_KEY_SECRET,
    })
    let order
    try {
      order = await razorpay.orders.create({
        amount: quote.provider_amount,
        currency: quote.currency,
        receipt: `cc_${quote.id}`,
        notes: {
          user_id: user.id,
          product_id: product.id,
          checkout_id: quote.id,
        },
      })
    } catch (error) {
      // Do not release on network uncertainty: the provider may have created an order.
      logger.error(
        'Provider order creation failed; reservation awaits expiry',
        error,
      )
      throw error
    }

    const { error: recordError } = await admin.rpc('record_checkout_order', {
      requested_id: quote.id,
      requested_order: order.id,
    })

    if (recordError) {
      const status = recordError.code === '23505' ? 409 : 500
      return NextResponse.json({ error: recordError.message }, { status })
    }

    return response(order.id)
  } catch (error: unknown) {
    logger.error('Failed to create payment order', error)
    return NextResponse.json(
      { error: 'Unable to create payment order' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return withMonitoringRequest(request, 'payment.create_order', () =>
    createPaymentOrder(request),
  )
}
