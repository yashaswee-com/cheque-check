import { Cheque, ChequeStatus, ChequeWithRelations } from '@/types'
import { TABLES } from '@/lib/supabase/tables'
import {
  parseDatabaseValue,
  SupabaseRepository,
} from '@/repositories/base.repository'
import {
  persistedChequeSchema,
  relatedChequeSchema,
  relatedChequesSchema,
} from '@/validators/persisted-cheque'
import type {
  ChequeListRequest,
  ChequePage,
  ChequeSummaryRow,
} from '@/types/cheque-list'
import type { ChequeDateRange } from '../lib/date-range'
import { DatabaseError } from '@/lib/errors'

const RELATIONS =
  '*, party:parties(name, contact, color, icon, avatar_url), account:accounts(account_name, logo_url, color, icon, bank:banks(name, logo_url))'

export interface IChequeRepository {
  getAmountBounds(businessId: string): Promise<{ min: number; max: number }>
  getAll(businessId: string): Promise<ChequeWithRelations[]>
  getPage(request: ChequeListRequest): Promise<ChequePage<ChequeWithRelations>>
  getAmountCeiling(businessId: string): Promise<number>
  getBusinessSummaries(
    today: string,
  ): Promise<{ business_id: string; upcoming_total: number }[]>
  getSummary(
    businessId: string,
    today: string,
    includeInward: boolean,
    range?: ChequeDateRange,
  ): Promise<ChequeSummaryRow[]>
  getById(id: string): Promise<ChequeWithRelations>
  create(
    input: Omit<Cheque, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Cheque>
  update(
    id: string,
    input: Partial<
      Omit<
        Cheque,
        'id' | 'business_id' | 'status' | 'created_at' | 'updated_at'
      >
    >,
  ): Promise<Cheque>
  updateStatus(id: string, status: ChequeStatus): Promise<Cheque>
  delete(id: string): Promise<void>
}

export class SupabaseChequeRepository
  extends SupabaseRepository
  implements IChequeRepository
{
  async getAll(businessId: string): Promise<ChequeWithRelations[]> {
    const rows: ChequeWithRelations[] = []
    let cursor: string | undefined
    for (;;) {
      let query = this.supabase
        .from(TABLES.CHEQUES)
        .select(RELATIONS)
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('is_draft', false)
        .order('id')
        .limit(500)
      if (cursor) query = query.gt('id', cursor)
      const page = parseDatabaseValue(
        await this.handle(query),
        relatedChequesSchema,
        'cheque relations',
      )
      rows.push(...page)
      if (page.length < 500) break
      cursor = page[page.length - 1].id
    }
    return rows.sort(
      (a, b) =>
        a.cheque_date.localeCompare(b.cheque_date) || a.id.localeCompare(b.id),
    )
  }

  async getAmountCeiling(businessId: string): Promise<number> {
    const rows = await this.handle(
      this.supabase
        .from(TABLES.CHEQUES)
        .select('amount')
        .eq('business_id', businessId)
        .is('deleted_at', null)
        .eq('is_draft', false)
        .order('amount', { ascending: false })
        .limit(1),
    )
    const amount = Number(rows[0]?.amount ?? 0)
    return Number.isFinite(amount) && amount > 0 ? amount : 0
  }

  async getAmountBounds(
    businessId: string,
  ): Promise<{ min: number; max: number }> {
    const read = (ascending: boolean) =>
      this.handle(
        this.supabase
          .from(TABLES.CHEQUES)
          .select('amount')
          .eq('business_id', businessId)
          .is('deleted_at', null)
          .eq('is_draft', false)
          .order('amount', { ascending })
          .limit(1),
      )
    const [lowest, highest] = await Promise.all([read(true), read(false)])
    const min = Number(lowest[0]?.amount ?? 0)
    const max = Number(highest[0]?.amount ?? 0)
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min)
      throw new DatabaseError(
        'Invalid cheque amount bounds returned from the database',
      )
    return { min, max }
  }

  async getPage(
    request: ChequeListRequest,
  ): Promise<ChequePage<ChequeWithRelations>> {
    const native = request.nativeFilters ?? {}
    const page = await this.handle(
      this.supabase.rpc('cheque_list_page', {
        requested_business: request.businessId,
        requested_search: request.search ?? '',
        requested_status: request.status,
        requested_sort: request.sortBy ?? 'date',
        requested_order: request.sortOrder ?? 'desc',
        requested_offset: request.offset ?? 0,
        requested_limit: request.limit ?? 50,
        requested_include_inward: request.includeInward ?? true,
        requested_native_search: native.search ?? '',
        requested_native_status: native.status,
        requested_type: native.type,
        requested_party: native.party_id,
        requested_account: native.account_id,
        requested_from: native.from,
        requested_to: native.to,
        requested_statuses: native.statuses,
        requested_party_type: native.party_type,
        requested_due_from: native.due_from,
        requested_due_to: native.due_to,
        requested_min_amount: native.min_amount,
        requested_max_amount: native.max_amount,
        requested_banks: native.bank_ids?.filter((id) => id !== 'unknown')
          .length
          ? native.bank_ids.filter((id) => id !== 'unknown')
          : undefined,
        requested_unknown_bank: native.bank_ids?.includes('unknown'),
      }),
    )
    if (!page.length)
      throw new DatabaseError('Cheque page metadata was not returned')
    const ids = page.flatMap((row) => (row.cheque_id ? [row.cheque_id] : []))
    const rows = ids.length
      ? parseDatabaseValue(
          await this.handle(
            this.supabase
              .from(TABLES.CHEQUES)
              .select(RELATIONS)
              .in('id', ids)
              .eq('business_id', request.businessId)
              .is('deleted_at', null)
              .eq('is_draft', false),
          ),
          relatedChequesSchema,
          'cheque relations',
        )
      : []
    const byId = new Map(rows.map((row) => [row.id, row]))
    return {
      rows: ids.flatMap((id) => {
        const row = byId.get(id)
        return row ? [row] : []
      }),
      matchingCount: page[0].matching_count,
      activeCount: page[0].active_count,
    }
  }

  async getBusinessSummaries(today: string) {
    return this.handle(
      this.supabase.rpc('business_cheque_summaries', {
        requested_today: today,
      }),
    )
  }

  async getSummary(
    businessId: string,
    today: string,
    includeInward: boolean,
    range: ChequeDateRange = {},
  ) {
    return this.handle(
      this.supabase.rpc('cheque_summary', {
        requested_business: businessId,
        requested_today: today,
        requested_include_inward: includeInward,
        requested_from: range.from,
        requested_to: range.to,
      }),
    )
  }

  async getById(id: string): Promise<ChequeWithRelations> {
    return parseDatabaseValue(
      await this.handle(
        this.supabase
          .from(TABLES.CHEQUES)
          .select(RELATIONS)
          .eq('id', id)
          .is('deleted_at', null)
          .single(),
      ),
      relatedChequeSchema,
      'cheque relations',
    )
  }

  async create(
    input: Omit<Cheque, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<Cheque> {
    return parseDatabaseValue(
      await this.handle(
        this.supabase.from(TABLES.CHEQUES).insert([input]).select().single(),
      ),
      persistedChequeSchema,
      'cheque',
    )
  }

  async update(
    id: string,
    input: Partial<
      Omit<
        Cheque,
        'id' | 'business_id' | 'status' | 'created_at' | 'updated_at'
      >
    >,
  ): Promise<Cheque> {
    return parseDatabaseValue(
      await this.handle(
        this.supabase
          .from(TABLES.CHEQUES)
          .update(input)
          .eq('id', id)
          .select()
          .single(),
      ),
      persistedChequeSchema,
      'cheque',
    )
  }

  async updateStatus(id: string, status: ChequeStatus): Promise<Cheque> {
    return parseDatabaseValue(
      await this.handle(
        this.supabase
          .from(TABLES.CHEQUES)
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single(),
      ),
      persistedChequeSchema,
      'cheque',
    )
  }

  async delete(id: string): Promise<void> {
    await this.handleVoid(
      this.supabase.rpc('lifecycle_delete', {
        requested_table: TABLES.CHEQUES,
        requested_id: id,
      }),
    )
  }
}
