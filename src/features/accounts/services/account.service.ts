import { Account } from '@/types'
import { createLazyService } from '@/lib/lazy-service'
import {
  IAccountRepository,
  SupabaseAccountRepository,
} from '@/features/accounts/repositories/account.repository'

export class AccountService {
  constructor(
    private readonly repository: IAccountRepository = new SupabaseAccountRepository(),
  ) {}

  async getAll(businessId: string): Promise<Account[]> {
    return this.repository.getAll(businessId)
  }

  async getById(id: string): Promise<Account> {
    return this.repository.getById(id)
  }

  async create(
    account: Omit<
      Account,
      'id' | 'created_at' | 'updated_at' | 'bank' | 'deleted_at'
    >,
  ): Promise<Account> {
    return this.repository.create(account)
  }

  async update(
    id: string,
    account: Partial<
      Omit<
        Account,
        | 'id'
        | 'business_id'
        | 'created_at'
        | 'updated_at'
        | 'bank'
        | 'deleted_at'
      >
    >,
  ): Promise<Account> {
    return this.repository.update(id, account)
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export const accountService = createLazyService(
  () => new AccountService(),
  AccountService.prototype,
)
