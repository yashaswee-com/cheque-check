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
  private pending = new Map<PaymentProductId, string>()
  async createOrder(productId: PaymentProductId): Promise<PaymentOrder> {
    const checkoutId = this.pending.get(productId) ?? crypto.randomUUID()
    this.pending.set(productId, checkoutId)
    const response = await monitoredFetch('/api/payments/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, checkoutId }),
    })

    const body: unknown = await response.json()

    if (!response.ok) {
      if ([401, 403, 410].includes(response.status))
        this.pending.delete(productId)
      const message =
        typeof body === 'object' && body && 'error' in body
          ? String(body.error)
          : 'Unable to create payment order'
      throw new Error(message)
    }
    return PaymentOrderSchema.parse(body)
  }
  complete(productId: PaymentProductId) {
    this.pending.delete(productId)
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
