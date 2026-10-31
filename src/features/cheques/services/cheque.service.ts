import { Cheque, ChequeStatus, ChequeWithRelations } from '@/types'
import { ValidationError } from '@/lib/errors'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import type { ChequeListRequest, ChequePage } from '@/types/cheque-list'
import type { ChequeDateRange } from '../lib/date-range'
import {
  IChequeRepository,
  SupabaseChequeRepository,
} from '@/features/cheques/repositories/cheque.repository'

let defaultChequeService: ChequeService | undefined

function getDefaultChequeService(): ChequeService {
  if (!defaultChequeService) {
    defaultChequeService = new ChequeService()
  }

  return defaultChequeService
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
    const page = await this.repository.getPage(request)
    return { ...page, rows: page.rows.map((row) => ChequeEntity.fromRow(row)) }
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
    return ChequeEntity.fromRow(created as ChequeWithRelations)
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
    return ChequeEntity.fromRow(updated as ChequeWithRelations)
  }

  async updateStatus(id: string, status: ChequeStatus): Promise<ChequeEntity> {
    const current = ChequeEntity.fromRow(await this.repository.getById(id))

    if (!current.canTransition(status)) {
      throw new ValidationError(
        `Cannot transition cheque from ${current.status} to ${status}`,
      )
    }

    const row = await this.repository.updateStatus(id, status)
    return ChequeEntity.fromRow(row as ChequeWithRelations)
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

const chequeServiceTarget = Object.create(
  ChequeService.prototype,
) as ChequeService

export const chequeService = new Proxy(chequeServiceTarget, {
  get(_target, property, receiver) {
    const service = getDefaultChequeService()
    const value = Reflect.get(service, property, receiver)
    return typeof value === 'function' ? value.bind(service) : value
  },
})
