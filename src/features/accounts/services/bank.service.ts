import { Bank } from '@/types'
import { ValidationError } from '@/lib/errors'
import { countryName, DEFAULT_COUNTRY_CODE } from '@/lib/countries'
import { isValidBankName } from '../lib/bank-name'
import {
  BANK_TYPES,
  isValidBankAbbreviation,
  normalizeBankAbbreviation,
} from '../lib/bank-details'
import {
  CustomBankInput,
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

  async create(input: CustomBankInput): Promise<Bank> {
    if (!isValidBankName(input.name)) {
      throw new ValidationError(
        'Enter a bank name between 2 and 120 characters.',
      )
    }
    const abbreviation = normalizeBankAbbreviation(input.abbreviation ?? '')
    if (!isValidBankAbbreviation(abbreviation)) {
      throw new ValidationError(
        'Enter an abbreviation of 2 to 10 letters or digits.',
      )
    }
    if (input.bank_type && !BANK_TYPES.includes(input.bank_type)) {
      throw new ValidationError('Select a valid bank type.')
    }
    const countryCode = input.country_code ?? DEFAULT_COUNTRY_CODE
    if (!countryName(countryCode)) {
      throw new ValidationError('Select a valid country.')
    }
    return this.repository.create({
      ...(input.logo_url !== undefined ? { logo_url: input.logo_url } : {}),
      name: input.name.trim(),
      abbreviation: abbreviation || null,
      bank_type: input.bank_type ?? null,
      country_code: countryCode,
    })
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
