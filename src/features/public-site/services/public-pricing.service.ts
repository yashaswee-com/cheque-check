import {
  PublicPricingRepository,
  type PublicProduct,
} from '@/features/public-site/repositories/public-pricing.repository'

export class PublicPricingService {
  constructor(private readonly repository = new PublicPricingRepository()) {}

  listProducts(): Promise<PublicProduct[]> {
    return this.repository.listProducts()
  }
}

export const publicPricingService = new PublicPricingService()
