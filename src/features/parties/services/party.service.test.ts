import { describe, expect, it, vi } from 'vitest'
import type { Party } from '@/types'
import type { IPartyRepository } from '@/features/parties/repositories/party.repository'
import { PartyService } from './party.service'

describe('PartyService', () => {
  it('delegates party reads, writes, and deletion to its repository', async () => {
    const party = { id: 'party-1' } as Party
    const repository = {
      getAll: vi.fn().mockResolvedValue([party]),
      getById: vi.fn().mockResolvedValue(party),
      create: vi.fn().mockResolvedValue(party),
      update: vi.fn().mockResolvedValue(party),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPartyRepository
    const service = new PartyService(repository)
    const input = {
      business_id: 'business-1',
      name: 'Acme',
      contact: '9876543210',
      email: null,
      address: null,
      notes: null,
    }

    await expect(service.getAll('business-1')).resolves.toEqual([party])
    await expect(service.getById('party-1')).resolves.toBe(party)
    await expect(service.create(input)).resolves.toBe(party)
    await expect(service.update('party-1', { name: 'Updated' })).resolves.toBe(
      party,
    )
    await expect(service.delete('party-1')).resolves.toBeUndefined()

    expect(repository.getAll).toHaveBeenCalledWith('business-1')
    expect(repository.getById).toHaveBeenCalledWith('party-1')
    expect(repository.create).toHaveBeenCalledWith(input)
    expect(repository.update).toHaveBeenCalledWith('party-1', {
      name: 'Updated',
    })
    expect(repository.delete).toHaveBeenCalledWith('party-1')
  })

  it('propagates repository failures to callers', async () => {
    const error = new Error('Party could not be loaded')
    const repository = {
      getById: vi.fn().mockRejectedValue(error),
    } as unknown as IPartyRepository

    await expect(new PartyService(repository).getById('missing')).rejects.toBe(
      error,
    )
  })
})
