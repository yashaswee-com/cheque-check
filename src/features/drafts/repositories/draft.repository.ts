import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseRepository } from '@/repositories/base.repository'
import { TABLES } from '@/lib/supabase/tables'
import type {
  Account,
  AccountDraft,
  AccountDraftFields,
  Cheque,
  ChequeDraft,
  ChequeDraftFields,
  Party,
  PartyDraft,
  PartyDraftFields,
} from '@/types'
import type { z } from 'zod'
import {
  accountDraftSchema,
  chequeDraftSchema,
  partyDraftSchema,
  persistedAccountSchema,
  persistedPartySchema,
} from '@/validators/persisted-draft'
import { persistedChequeSchema } from '@/validators/persisted-cheque'
import { parseDatabaseValue } from '@/repositories/base.repository'

export type PublishedChequeInput = Omit<
  Cheque,
  'id' | 'business_id' | 'created_at' | 'updated_at'
>
export type PublishedPartyInput = Omit<
  Party,
  'id' | 'business_id' | 'created_at' | 'updated_at'
>
export type PublishedAccountInput = Omit<
  Account,
  'id' | 'business_id' | 'created_at' | 'updated_at'
>

type DraftTable =
  typeof TABLES.CHEQUES | typeof TABLES.PARTIES | typeof TABLES.ACCOUNTS

export interface IDraftRepository<TDraft, TFields, TPublished, TPublishInput> {
  list(businessId: string): Promise<TDraft[]>
  getById(id: string): Promise<TDraft>
  create(businessId: string, fields: Partial<TFields>): Promise<TDraft>
  update(id: string, fields: Partial<TFields>): Promise<TDraft>
  delete(id: string): Promise<void>
  publish(id: string, values: TPublishInput): Promise<TPublished>
}

export class SupabaseDraftRepository<
  TDraft,
  TFields,
  TPublished,
  TPublishInput extends object,
>
  extends SupabaseRepository
  implements IDraftRepository<TDraft, TFields, TPublished, TPublishInput>
{
  constructor(
    private readonly table: DraftTable,
    private readonly selection: string,
    private readonly draftSchema: z.ZodType<TDraft>,
    private readonly publishedSchema: z.ZodType<TPublished>,
  ) {
    super()
  }

  // Draft rows have nullable columns the typed insert/update signatures don't model.
  protected get db() {
    return (this.supabase as SupabaseClient).from(this.table)
  }

  async list(businessId: string): Promise<TDraft[]> {
    return parseDatabaseValue(
      await this.handle(
        this.db
          .select(this.selection)
          .eq('business_id', businessId)
          .eq('is_draft', true)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false }),
      ),
      this.draftSchema.array(),
      'draft list',
    )
  }

  async getById(id: string): Promise<TDraft> {
    return parseDatabaseValue(
      await this.handle(
        this.db
          .select(this.selection)
          .eq('id', id)
          .eq('is_draft', true)
          .is('deleted_at', null)
          .single(),
      ),
      this.draftSchema,
      'draft',
    )
  }

  async create(businessId: string, fields: Partial<TFields>): Promise<TDraft> {
    return parseDatabaseValue(
      await this.handle(
        this.db
          .insert([{ ...fields, business_id: businessId, is_draft: true }])
          .select(this.selection)
          .single(),
      ),
      this.draftSchema,
      'draft',
    )
  }

  async update(id: string, fields: Partial<TFields>): Promise<TDraft> {
    return parseDatabaseValue(
      await this.handle(
        this.db
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('is_draft', true)
          .select(this.selection)
          .single(),
      ),
      this.draftSchema,
      'draft',
    )
  }

  async delete(id: string): Promise<void> {
    await this.getById(id)
    await this.handleVoid(
      this.supabase.rpc('lifecycle_delete', {
        requested_table: this.table,
        requested_id: id,
      }),
    )
  }

  async publish(id: string, values: TPublishInput): Promise<TPublished> {
    return parseDatabaseValue(
      await this.handle(
        this.db
          .update({
            ...values,
            is_draft: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('is_draft', true)
          .select()
          .single(),
      ),
      this.publishedSchema,
      'published draft',
    )
  }
}

export interface IChequeDraftRepository extends IDraftRepository<
  ChequeDraft,
  ChequeDraftFields,
  Cheque,
  PublishedChequeInput
> {
  duplicate(sourceId: string): Promise<ChequeDraft>
  hasNumberConflict(
    businessId: string,
    accountId: string,
    chequeNumber: string,
    excludeId?: string,
  ): Promise<boolean>
}

export class SupabaseChequeDraftRepository
  extends SupabaseDraftRepository<
    ChequeDraft,
    ChequeDraftFields,
    Cheque,
    PublishedChequeInput
  >
  implements IChequeDraftRepository
{
  constructor() {
    super(
      TABLES.CHEQUES,
      '*, party:parties(name, color, icon, avatar_url), account:accounts(account_name, color, icon, bank:banks(name, logo_url))',
      chequeDraftSchema,
      persistedChequeSchema,
    )
  }

  async duplicate(sourceId: string): Promise<ChequeDraft> {
    return parseDatabaseValue(
      await this.handle(
        this.supabase.rpc('duplicate_cheque_draft', {
          requested_cheque: sourceId,
        }),
      ),
      chequeDraftSchema,
      'duplicated cheque draft',
    )
  }

  async hasNumberConflict(
    businessId: string,
    accountId: string,
    chequeNumber: string,
    excludeId?: string,
  ): Promise<boolean> {
    let query = this.db
      .select('id')
      .eq('business_id', businessId)
      .eq('account_id', accountId)
      .eq('cheque_number', chequeNumber)
      .eq('is_draft', false)
      .is('deleted_at', null)
    if (excludeId) query = query.neq('id', excludeId)
    const rows = await this.handle(query.limit(1))
    return (rows as unknown[]).length > 0
  }
}

export class SupabasePartyDraftRepository extends SupabaseDraftRepository<
  PartyDraft,
  PartyDraftFields,
  Party,
  PublishedPartyInput
> {
  constructor() {
    super(TABLES.PARTIES, '*', partyDraftSchema, persistedPartySchema)
  }
}

export class SupabaseAccountDraftRepository extends SupabaseDraftRepository<
  AccountDraft,
  AccountDraftFields,
  Account,
  PublishedAccountInput
> {
  constructor() {
    super(
      TABLES.ACCOUNTS,
      '*, bank:banks(id, name, logo_url)',
      accountDraftSchema,
      persistedAccountSchema,
    )
  }
}
