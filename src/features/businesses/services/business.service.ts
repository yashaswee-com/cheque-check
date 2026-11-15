import { Business } from '@/types'
import { createLazyService } from '@/lib/lazy-service'
import {
  IBusinessRepository,
  SupabaseBusinessRepository,
} from '@/features/businesses/repositories/business.repository'

export class BusinessService {
  constructor(
    private readonly repository: IBusinessRepository = new SupabaseBusinessRepository(),
  ) {}

  async getAll(): Promise<Business[]> {
    return this.repository.getAll()
  }

  async getById(id: string): Promise<Business> {
    return this.repository.getById(id)
  }

  async create(
    business: Omit<
      Business,
      'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'
    >,
  ): Promise<Business> {
    return this.repository.create(business)
  }

  async update(
    id: string,
    business: Partial<
      Omit<
        Business,
        'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'
      >
    >,
  ): Promise<Business> {
    return this.repository.update(id, business)
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export const businessService = createLazyService(
  () => new BusinessService(),
  BusinessService.prototype,
)
