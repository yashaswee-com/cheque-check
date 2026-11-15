import { Party } from '@/types'
import { createLazyService } from '@/lib/lazy-service'
import {
  IPartyRepository,
  SupabasePartyRepository,
} from '@/features/parties/repositories/party.repository'

export class PartyService {
  constructor(
    private readonly repository: IPartyRepository = new SupabasePartyRepository(),
  ) {}

  async getAll(businessId: string): Promise<Party[]> {
    return this.repository.getAll(businessId)
  }

  async getById(id: string): Promise<Party> {
    return this.repository.getById(id)
  }

  async create(
    party: Omit<Party, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>,
  ): Promise<Party> {
    return this.repository.create(party)
  }

  async update(
    id: string,
    party: Partial<
      Omit<
        Party,
        'id' | 'business_id' | 'created_at' | 'updated_at' | 'deleted_at'
      >
    >,
  ): Promise<Party> {
    return this.repository.update(id, party)
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export const partyService = createLazyService(
  () => new PartyService(),
  PartyService.prototype,
)
