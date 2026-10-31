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

    const razorpayEnv = getRazorpayEnv()
    const razorpay = new Razorpay({
      key_id: razorpayEnv.RAZORPAY_KEY_ID,
      key_secret: razorpayEnv.RAZORPAY_KEY_SECRET,
    })
    const order = await razorpay.orders.create({
      amount: product.amount,
      currency: product.currency,
      receipt: `cc_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: { user_id: user.id, product_id: product.id },
    })

    const { error: recordError } = await admin.rpc('record_payment_order', {
      order_user_id: user.id,
      requested_product_id: product.id,
      razorpay_order: order.id,
    })

    if (recordError) {
      const status = recordError.code === '23505' ? 409 : 500
      return NextResponse.json({ error: recordError.message }, { status })
    }

    return NextResponse.json({
      id: order.id,
      amount: product.amount,
      currency: product.currency,
      productId: product.id,
      name: product.name,
    })
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
