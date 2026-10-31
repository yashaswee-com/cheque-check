import { describe, expect, it, vi } from 'vitest'
import type { IMonetizationRepository } from '@/features/monetization/repositories/monetization.repository'
import { MonetizationService } from './monetization.service'

describe('MonetizationService', () => {
  it('delegates entitlement, quota, and transaction reads', async () => {
    const entitlements = [{ id: 'entitlement-1' }]
    const quotas = [{ id: 'quota-1' }]
    const transactions = [{ id: 'transaction-1' }]
    const repository = {
      getEntitlements: vi.fn().mockResolvedValue(entitlements),
      getQuotas: vi.fn().mockResolvedValue(quotas),
      getTransactions: vi.fn().mockResolvedValue(transactions),
    } as unknown as IMonetizationRepository
    const service = new MonetizationService(repository)

    await expect(service.getEntitlements()).resolves.toEqual(entitlements)
    await expect(service.getQuotas()).resolves.toEqual(quotas)
    await expect(service.getTransactions()).resolves.toEqual(transactions)
    expect(repository.getEntitlements).toHaveBeenCalledOnce()
    expect(repository.getQuotas).toHaveBeenCalledOnce()
    expect(repository.getTransactions).toHaveBeenCalledOnce()
  })

  it('propagates repository failures', async () => {
    const error = new Error('Entitlement query failed')
    const repository = {
      getEntitlements: vi.fn().mockRejectedValue(error),
    } as unknown as IMonetizationRepository

    await expect(
      new MonetizationService(repository).getEntitlements(),
    ).rejects.toBe(error)
  })
})
