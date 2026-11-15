import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CreatePaymentOrderSchema } from '@/lib/payments'
import { logger } from '@/lib/logger'
import { setRequestUser, withMonitoringRequest } from '@/lib/monitoring/server'
import { createPaymentCheckout } from '@/features/monetization/services/payment-checkout.use-case'
import {
  createCheckoutPersistence,
  createRazorpayCheckoutProvider,
} from '@/features/monetization/services/payment-checkout.adapters'

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

    const result = await createPaymentCheckout(
      { userId: user.id, ...requestResult.data },
      {
        persistence: createCheckoutPersistence(),
        createProvider: createRazorpayCheckoutProvider,
        randomUUID: () => crypto.randomUUID(),
        now: () => Date.now(),
        logError: (message, error) => logger.error(message, error),
      },
    )
    if (result.ok) return NextResponse.json(result.order)

    const failure = result.failure
    switch (failure.reason) {
      case 'unavailable':
        return NextResponse.json(
          { error: 'Payment product is unavailable' },
          { status: 404 },
        )
      case 'already-active':
        return NextResponse.json(
          { error: 'This product is already active' },
          { status: 409 },
        )
      case 'entitlement-required':
        return NextResponse.json(
          { error: 'An active subscription is required for this top-up' },
          { status: 403 },
        )
      case 'closed':
        return NextResponse.json(
          { error: 'Checkout expired or closed. Start a new checkout.' },
          { status: 410 },
        )
      case 'quote-error':
        return NextResponse.json(
          { error: failure.error.message },
          {
            status:
              failure.error.code === '23505'
                ? 409
                : failure.error.code === '42501'
                  ? 403
                  : 500,
          },
        )
      case 'record-error':
        return NextResponse.json(
          { error: failure.error.message },
          { status: failure.error.code === '23505' ? 409 : 500 },
        )
    }
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
