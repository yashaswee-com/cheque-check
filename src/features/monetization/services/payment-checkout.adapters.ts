import Razorpay from 'razorpay'
import { getRazorpayEnv } from '@/lib/env/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import type {
  CheckoutPersistence,
  CheckoutProvider,
} from './payment-checkout.use-case'

export function createCheckoutPersistence(): CheckoutPersistence {
  const admin = createAdminClient()
  return {
    async findProduct(id) {
      const { data, error } = await admin
        .from(TABLES.PAYMENT_PRODUCTS)
        .select(
          'id, name, transaction_type, feature_id, amount, currency, required_entitlement_id, is_free',
        )
        .eq('id', id)
        .eq('active', true)
        .single()
      return error ? null : data
    },
    async findActiveEntitlements(userId) {
      const { data, error } = await admin
        .from(TABLES.USER_ENTITLEMENTS)
        .select('feature_id, status, valid_until')
        .eq('user_id', userId)
        .eq('status', 'active')
      if (error) throw error
      return data ?? []
    },
    async prepareCheckout(checkoutId, userId, productId) {
      const { data, error } = await admin.rpc('prepare_payment_checkout', {
        requested_id: checkoutId,
        requested_user: userId,
        requested_product: productId,
      })
      return { data, error }
    },
    async fulfillWalletCheckout(checkoutId) {
      const { error } = await admin.rpc('fulfill_wallet_checkout', {
        requested_id: checkoutId,
      })
      if (error) throw error
    },
    async recordOrder(checkoutId, orderId) {
      const { error } = await admin.rpc('record_checkout_order', {
        requested_id: checkoutId,
        requested_order: orderId,
      })
      return error
    },
  }
}

export function createRazorpayCheckoutProvider(): CheckoutProvider {
  const env = getRazorpayEnv()
  const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  })
  return {
    async createOrder(input) {
      return razorpay.orders.create(input)
    },
  }
}
