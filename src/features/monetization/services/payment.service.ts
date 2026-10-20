import {
  PaymentOrder,
  PaymentOrderSchema,
  type PaymentProductId,
} from '@/lib/payments'
import { monitoredFetch } from '@/lib/monitoring/telemetry'

let defaultPaymentService: PaymentService | undefined

function getDefaultPaymentService(): PaymentService {
  if (!defaultPaymentService) {
    defaultPaymentService = new PaymentService()
  }

  return defaultPaymentService
}

export class PaymentService {
  async createOrder(productId: PaymentProductId): Promise<PaymentOrder> {
    const response = await monitoredFetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId }),
    })

    const body: unknown = await response.json()

    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String(body.error)
          : 'Unable to create payment order'
      throw new Error(message)
    }

    return PaymentOrderSchema.parse(body)
  }
}

export const paymentService = new Proxy(
  Object.create(PaymentService.prototype),
  {
    get(_target, property, receiver) {
      const service = getDefaultPaymentService()
      const value = Reflect.get(service, property, receiver)
      return typeof value === 'function' ? value.bind(service) : value
    },
  },
)
