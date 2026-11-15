import { Cheque, ChequeStatus } from '@/types'
import { createLazyService } from '@/lib/lazy-service'
import { ValidationError } from '@/lib/errors'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import type { ChequeListRequest, ChequePage } from '@/types/cheque-list'
import type { ChequeDateRange } from '../lib/date-range'
import { chequeListFiltersSchema } from '@/validators/cheque-list-filters'
import {
  IChequeRepository,
  SupabaseChequeRepository,
  type ChequeStatusRepository,
} from '@/features/cheques/repositories/cheque.repository'

export class ChequeStatusService {
  constructor(private readonly repository: ChequeStatusRepository) {}

  async updateStatus(id: string, status: ChequeStatus): Promise<ChequeEntity> {
    const current = ChequeEntity.fromRow(await this.repository.getById(id))
    if (!current.canTransition(status)) {
      throw new ValidationError(
        `Cannot transition cheque from ${current.status} to ${status}`,
      )
    }
    return ChequeEntity.fromRow(await this.repository.updateStatus(id, status))
  }
}
export class ChequeService {
  constructor(
    private readonly repository: IChequeRepository = new SupabaseChequeRepository(),
  ) {}

  async getAll(businessId: string): Promise<ChequeEntity[]> {
    const rows = await this.repository.getAll(businessId)
    return rows.map((row) => ChequeEntity.fromRow(row))
  }

  async getPage(request: ChequeListRequest): Promise<ChequePage<ChequeEntity>> {
    const filters = chequeListFiltersSchema.safeParse(
      request.nativeFilters ?? {},
    )
    if (!filters.success)
      throw new ValidationError(
        filters.error.issues.map((issue) => issue.message).join('; '),
      )
    const page = await this.repository.getPage(request)
    return { ...page, rows: page.rows.map((row) => ChequeEntity.fromRow(row)) }
  }

  getAmountCeiling(businessId: string) {
    return this.repository.getAmountCeiling(businessId)
  }

  getAmountBounds(businessId: string) {
    return this.repository.getAmountBounds(businessId)
  }

  getBusinessSummaries(today: string) {
    return this.repository.getBusinessSummaries(today)
  }

  getSummary(
    businessId: string,
    today: string,
    includeInward: boolean,
    range?: ChequeDateRange,
  ) {
    return this.repository.getSummary(businessId, today, includeInward, range)
  }

  async getById(id: string): Promise<ChequeEntity> {
    const row = await this.repository.getById(id)
    return ChequeEntity.fromRow(row)
  }

  async create(
    cheque: Omit<Cheque, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<ChequeEntity> {
    const created = await this.repository.create(cheque)
    return ChequeEntity.fromRow(created)
  }

  async update(
    id: string,
    cheque: Partial<
      Omit<
        Cheque,
        'id' | 'business_id' | 'status' | 'created_at' | 'updated_at'
      >
    >,
  ): Promise<ChequeEntity> {
    const updated = await this.repository.update(id, cheque)
    return ChequeEntity.fromRow(updated)
  }

  async updateStatus(id: string, status: ChequeStatus): Promise<ChequeEntity> {
    return new ChequeStatusService(this.repository).updateStatus(id, status)
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export const chequeService = createLazyService(
  () => new ChequeService(),
  ChequeService.prototype,
)
