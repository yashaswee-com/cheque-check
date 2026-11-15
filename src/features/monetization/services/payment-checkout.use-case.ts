import { isEntitlementCurrent } from '@/features/monetization/lib/premium-access'
import type { PaymentProductId } from '@/lib/payments'
import { paymentCheckoutSchema } from '@/validators/payment-checkout'

type CheckoutError = { code: string; message: string }
type Product = {
  id: string
  name: string
  transaction_type: string
  feature_id: string
  amount: number
  required_entitlement_id: string | null
  is_free: boolean
}
type Entitlement = { feature_id: string; valid_until: string | null }

export interface CheckoutPersistence {
  findProduct(id: PaymentProductId): Promise<Product | null>
  findActiveEntitlements(userId: string): Promise<Entitlement[]>
  prepareCheckout(
    checkoutId: string,
    userId: string,
    productId: string,
  ): Promise<{ data: unknown; error: CheckoutError | null }>
  fulfillWalletCheckout(checkoutId: string): Promise<void>
  recordOrder(
    checkoutId: string,
    orderId: string,
  ): Promise<CheckoutError | null>
}

export interface CheckoutProvider {
  createOrder(input: {
    amount: number
    currency: 'INR'
    receipt: string
    notes: { user_id: string; product_id: string; checkout_id: string }
  }): Promise<{ id: string }>
}

type CheckoutFailure =
  | {
      reason:
        'unavailable' | 'already-active' | 'entitlement-required' | 'closed'
    }
  | { reason: 'quote-error' | 'record-error'; error: CheckoutError }

type CheckoutSuccess = {
  id: string
  amount: number
  currency: 'INR'
  productId: string
  name: string
  discount: number
  walletAmount: number
  walletFunded: boolean
}

export async function createPaymentCheckout(
  input: { userId: string; productId: PaymentProductId; checkoutId?: string },
  dependencies: {
    persistence: CheckoutPersistence
    createProvider: () => CheckoutProvider
    randomUUID: () => string
    now: () => number
    logError: (message: string, error: unknown) => void
  },
): Promise<
  { ok: true; order: CheckoutSuccess } | { ok: false; failure: CheckoutFailure }
> {
  const { persistence } = dependencies
  const product = await persistence.findProduct(input.productId)
  if (!product || product.is_free || product.amount <= 0)
    return { ok: false, failure: { reason: 'unavailable' } }

  const entitlements = await persistence.findActiveEntitlements(input.userId)
  const active = new Set(
    entitlements
      .filter((entitlement) =>
        isEntitlementCurrent(entitlement.valid_until, dependencies.now()),
      )
      .map((entitlement) => entitlement.feature_id),
  )
  if (
    (product.transaction_type === 'lifetime' ||
      product.transaction_type === 'subscription') &&
    active.has(product.feature_id)
  )
    return { ok: false, failure: { reason: 'already-active' } }
  if (
    product.required_entitlement_id &&
    !active.has(product.required_entitlement_id)
  )
    return { ok: false, failure: { reason: 'entitlement-required' } }

  const { data, error } = await persistence.prepareCheckout(
    input.checkoutId ?? dependencies.randomUUID(),
    input.userId,
    product.id,
  )
  if (error) {
    dependencies.logError('Payment quote failed', error)
    return { ok: false, failure: { reason: 'quote-error', error } }
  }
  const quote = paymentCheckoutSchema.parse(data)
  if (['expired', 'failed', 'refunded'].includes(quote.status))
    return { ok: false, failure: { reason: 'closed' } }

  const success = (id: string, walletFunded = false) => ({
    ok: true as const,
    order: {
      id,
      amount: quote.provider_amount,
      currency: quote.currency,
      productId: product.id,
      name: product.name,
      discount: quote.discount,
      walletAmount: quote.wallet_amount,
      walletFunded,
    },
  })
  if (quote.provider_amount === 0) {
    await persistence.fulfillWalletCheckout(quote.id)
    return success(`wallet_${quote.id}`, true)
  }
  if (quote.provider_order) return success(quote.provider_order)

  const provider = dependencies.createProvider()
  let order: { id: string }
  try {
    order = await provider.createOrder({
      amount: quote.provider_amount,
      currency: quote.currency,
      receipt: `cc_${quote.id}`,
      notes: {
        user_id: input.userId,
        product_id: product.id,
        checkout_id: quote.id,
      },
    })
  } catch (error) {
    // The provider may have created an order, so retain the reservation.
    dependencies.logError(
      'Provider order creation failed; reservation awaits expiry',
      error,
    )
    throw error
  }
  const recordError = await persistence.recordOrder(quote.id, order.id)
  if (recordError)
    return {
      ok: false,
      failure: { reason: 'record-error', error: recordError },
    }
  return success(order.id)
}
