import { describe, expect, it, vi } from 'vitest'
import { BankService } from './bank.service'
import type { IBankRepository } from '../repositories/bank.repository'
import { bankNameKey, isValidBankName } from '../lib/bank-name'

describe('bank names', () => {
  it('recognizes existing legal-name suffix variants', () => {
    expect(bankNameKey('HDFC Bank Limited')).toBe(bankNameKey(' HDFC Bank '))
    expect(bankNameKey('Yes Bank Ltd.')).toBe(bankNameKey('YES BANK'))
    expect(bankNameKey('Punjab & Sind Bank')).not.toBe(
      bankNameKey('Punjab National Bank'),
    )
  })

  it('rejects empty, oversized, punctuation-only and control-character names', () => {
    for (const name of ['', 'x', 'a'.repeat(121), '!!', 'Bank\nName']) {
      expect(isValidBankName(name)).toBe(false)
    }
    expect(isValidBankName('My Cooperative Bank')).toBe(true)
  })
})

describe('BankService', () => {
  const repository: IBankRepository = {
    getAll: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  }
  const service = new BankService(repository)

  it('trims valid names and delegates to the repository', async () => {
    await service.create('  My Bank  ')
    expect(repository.create).toHaveBeenCalledWith('My Bank')
  })

  it('does not send invalid names to the database', async () => {
    await expect(service.create('!')).rejects.toThrow()
  })

  it('propagates database failures rather than claiming success', async () => {
    vi.mocked(repository.delete).mockRejectedValueOnce(
      new Error('Account references this bank'),
    )
    await expect(service.delete('bank-id')).rejects.toThrow(
      'Account references this bank',
    )
  })
})
