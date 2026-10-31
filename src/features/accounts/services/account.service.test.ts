import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@/types'
import type { IAccountRepository } from '@/features/accounts/repositories/account.repository'
import { AccountService } from './account.service'

describe('AccountService', () => {
  it('delegates account reads, writes, and deletion to its repository', async () => {
    const account = { id: 'account-1' } as Account
    const repository = {
      getAll: vi.fn().mockResolvedValue([account]),
      getById: vi.fn().mockResolvedValue(account),
      create: vi.fn().mockResolvedValue(account),
      update: vi.fn().mockResolvedValue(account),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as IAccountRepository
    const service = new AccountService(repository)
    const input = {
      business_id: 'business-1',
      bank_id: null,
      account_name: 'Current Account',
      account_number: '12345678',
      ifsc_code: null,
      opening_balance: 0,
      is_default: false,
    }

    await expect(service.getAll('business-1')).resolves.toEqual([account])
    await expect(service.getById('account-1')).resolves.toBe(account)
    await expect(service.create(input)).resolves.toBe(account)
    await expect(
      service.update('account-1', { account_name: 'Updated Account' }),
    ).resolves.toBe(account)
    await expect(service.delete('account-1')).resolves.toBeUndefined()

    expect(repository.getAll).toHaveBeenCalledWith('business-1')
    expect(repository.getById).toHaveBeenCalledWith('account-1')
    expect(repository.create).toHaveBeenCalledWith(input)
    expect(repository.update).toHaveBeenCalledWith('account-1', {
      account_name: 'Updated Account',
    })
    expect(repository.delete).toHaveBeenCalledWith('account-1')
  })

  it('propagates repository failures to callers', async () => {
    const error = new Error('Account could not be loaded')
    const repository = {
      getById: vi.fn().mockRejectedValue(error),
    } as unknown as IAccountRepository

    await expect(
      new AccountService(repository).getById('missing'),
    ).rejects.toBe(error)
  })
})
