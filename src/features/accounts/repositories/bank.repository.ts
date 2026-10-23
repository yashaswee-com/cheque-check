import { Bank } from '@/types'
import { TABLES } from '@/lib/supabase/tables'
import { SupabaseRepository } from '@/repositories/base.repository'

export interface IBankRepository {
  getAll(): Promise<Bank[]>
  create(name: string): Promise<Bank>
  delete(id: string): Promise<void>
}

export class SupabaseBankRepository
  extends SupabaseRepository
  implements IBankRepository
{
  async getAll(): Promise<Bank[]> {
    const banks: Bank[] = []
    for (let from = 0; ; from += 500) {
      const page = await this.handle(
        this.supabase
          .from(TABLES.BANKS)
          .select('*')
          .is('deleted_at', null)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 499),
      )
      banks.push(...page)
      if (page.length < 500) return banks
    }
  }

  async create(name: string): Promise<Bank> {
    const { data, error } = await this.supabase.auth.getUser()
    if (error) throw error
    if (!data.user) throw new Error('Authentication required')
    return this.handle(
      this.supabase
        .from(TABLES.BANKS)
        .insert({ name, owner_id: data.user.id, category: 'custom' })
        .select()
        .single(),
    ) as Promise<Bank>
  }

  async delete(id: string): Promise<void> {
    await this.handleVoid(
      this.supabase.rpc('delete_private_bank', { requested_id: id }),
    )
  }
}
