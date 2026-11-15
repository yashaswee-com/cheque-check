import {
  PaymentOrder,
  PaymentOrderSchema,
  type PaymentProductId,
} from '@/lib/payments'
import { monitoredFetch } from '@/lib/monitoring/telemetry'
import { createLazyService } from '@/lib/lazy-service'

export class PaymentService {
  private pending = new Map<PaymentProductId, string>()

  constructor(
    private readonly transport: typeof monitoredFetch = monitoredFetch,
    private readonly randomUUID: () => string = () => crypto.randomUUID(),
  ) {}

  async createOrder(productId: PaymentProductId): Promise<PaymentOrder> {
    const checkoutId = this.pending.get(productId) ?? this.randomUUID()
    this.pending.set(productId, checkoutId)
    const response = await this.transport('/api/payments/create-order', {
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

export const paymentService = createLazyService(
  () => new PaymentService(),
  PaymentService.prototype,
)
