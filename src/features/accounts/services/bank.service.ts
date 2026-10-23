import { Bank } from '@/types'
import { ValidationError } from '@/lib/errors'
import { isValidBankName } from '../lib/bank-name'
import {
  IBankRepository,
  SupabaseBankRepository,
} from '@/features/accounts/repositories/bank.repository'

let defaultBankService: BankService | undefined

function getDefaultBankService(): BankService {
  if (!defaultBankService) {
    defaultBankService = new BankService()
  }

  return defaultBankService
}

export class BankService {
  constructor(
    private readonly repository: IBankRepository = new SupabaseBankRepository(),
  ) {}

  async getAll(): Promise<Bank[]> {
    return this.repository.getAll()
  }

  async create(name: string): Promise<Bank> {
    if (!isValidBankName(name)) {
      throw new ValidationError(
        'Enter a bank name between 2 and 120 characters.',
      )
    }
    return this.repository.create(name.trim())
  }

  async delete(id: string): Promise<void> {
    return this.repository.delete(id)
  }
}

export const bankService = new Proxy<BankService>(
  Object.create(BankService.prototype),
  {
    get(_target, property, receiver) {
      const service = getDefaultBankService()
      const value = Reflect.get(service, property, receiver)
      return typeof value === 'function' ? value.bind(service) : value
    },
  },
)
