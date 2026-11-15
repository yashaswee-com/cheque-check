import {
  Entitlement,
  IMonetizationRepository,
  Quota,
  SupabaseMonetizationRepository,
  Transaction,
  type PaymentProduct,
} from '@/features/monetization/repositories/monetization.repository'
import { createLazyService } from '@/lib/lazy-service'

export type { Entitlement, Quota, Transaction }

export class MonetizationService {
  constructor(
    private readonly repository: IMonetizationRepository = new SupabaseMonetizationRepository(),
  ) {}

  getProducts(): Promise<PaymentProduct[]> {
    return this.repository.getProducts()
  }

  async getEntitlements(): Promise<Entitlement[]> {
    return this.repository.getEntitlements()
  }

  async getQuotas(): Promise<Quota[]> {
    return this.repository.getQuotas()
  }

  async getTransactions(): Promise<Transaction[]> {
    return this.repository.getTransactions()
  }
}

export const monetizationService = createLazyService(
  () => new MonetizationService(),
  MonetizationService.prototype,
)
