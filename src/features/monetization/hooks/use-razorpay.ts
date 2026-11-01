import { useRef, useState } from 'react'
import { getRazorpayPublicKey } from '@/lib/env/client'
import { type PaymentProductId } from '@/lib/payments'
import { paymentService } from '@/features/monetization/services/payment.service'
import { recordOperation } from '@/lib/monitoring/telemetry'
import { logger } from '@/lib/logger'

type RazorpaySuccess = {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

type RazorpayCheckout = new (options: {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: RazorpaySuccess) => void
  modal: { ondismiss: () => void }
  theme: { color: string }
}) => { open: () => void }

declare global {
  interface Window {
    Razorpay: RazorpayCheckout
  }
}

export function useRazorpay() {
  const [isProcessing, setIsProcessing] = useState(false)
  const processing = useRef(false)

  const finish = () => {
    processing.current = false
    setIsProcessing(false)
  }

  const processPayment = async ({
    productId,
    onSuccess,
  }: {
    productId: PaymentProductId
    onSuccess?: () => void
  }) => {
    if (processing.current) return
    processing.current = true
    setIsProcessing(true)
    recordOperation('payment.checkout', 'started')
    try {
      const order = await paymentService.createOrder(productId)
      if (order.walletFunded) {
        paymentService.complete(productId)
        recordOperation('payment.wallet_checkout', 'success')
        finish()
        onSuccess?.()
        return
      }
      const checkout = new window.Razorpay({
        key: getRazorpayPublicKey(),
        amount: order.amount,
        currency: order.currency,
        name: 'Cheque Check',
        description: order.name,
        order_id: order.id,
        handler: () => {
          paymentService.complete(productId)
          recordOperation('payment.checkout_callback', 'success')
          finish()
          onSuccess?.()
        },
        modal: {
          ondismiss: () => {
            recordOperation('payment.checkout_dismissed', 'success')
            finish()
          },
        },
        theme: { color: '#000000' },
      })
      checkout.open()
    } catch (error) {
      finish()
      recordOperation('payment.checkout', 'failure')
      logger.error('Payment checkout failed', error, {
        operation: 'payment.checkout',
      })
      alert(
        error instanceof Error ? error.message : 'Failed to initiate payment',
      )
    }
  }

  return { processPayment, isProcessing }
}
