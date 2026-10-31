import { describe, expect, it, vi } from 'vitest'
import type { ChequeWithRelations } from '@/types'
import type { IChequeRepository } from '@/features/cheques/repositories/cheque.repository'
import { ChequeService } from './cheque.service'

const row: ChequeWithRelations = {
  id: '1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '100',
  amount: 100,
  cheque_date: '2025-01-01',
  deposit_date: null,
  remind_before_days: null,
  status: 'Issued',
  type: 'Outward',
  notes: null,
  image_url: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
}

function makeRepository(overrides: Partial<IChequeRepository> = {}) {
  return {
    getPage: vi.fn(),
    getBusinessSummaries: vi.fn(),
    getSummary: vi.fn(),
    getAll: vi.fn().mockResolvedValue([row]),
    getById: vi.fn().mockResolvedValue(row),
    create: vi.fn().mockResolvedValue(row),
    update: vi.fn().mockResolvedValue(row),
    updateStatus: vi.fn().mockResolvedValue(row),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } satisfies IChequeRepository
}

describe('ChequeService', () => {
  it('maps paginated rows to entities while preserving server counts', async () => {
    const getPage = vi.fn().mockResolvedValue({
      rows: [row],
      matchingCount: 17,
      activeCount: 29,
    })
    const repository = makeRepository({ getPage })
    const request = { businessId: 'b1', limit: 1 }
    const result = await new ChequeService(repository).getPage(request)
    expect(repository.getPage).toHaveBeenCalledWith(request)
    expect(result.rows[0].id).toBe(row.id)
    expect(result.rows[0].canTransition('Cleared')).toBe(true)
    expect(result).toMatchObject({ matchingCount: 17, activeCount: 29 })
  })

  it('forwards business and date-scoped summary requests unchanged', async () => {
    const getBusinessSummaries = vi
      .fn()
      .mockResolvedValue([{ business_id: 'b1' }])
    const getSummary = vi.fn().mockResolvedValue([{ total_amount: 100 }])
    const repository = makeRepository({ getBusinessSummaries, getSummary })
    const service = new ChequeService(repository)
    await expect(service.getBusinessSummaries('2026-10-31')).resolves.toEqual([
      { business_id: 'b1' },
    ])
    const range = { from: '2026-10-01', to: '2026-10-31' }
    await expect(
      service.getSummary('b1', '2026-10-31', false, range),
    ).resolves.toEqual([{ total_amount: 100 }])
    expect(repository.getBusinessSummaries).toHaveBeenCalledWith('2026-10-31')
    expect(repository.getSummary).toHaveBeenCalledWith(
      'b1',
      '2026-10-31',
      false,
      range,
    )
  })

  it('maps all repository rows to cheque entities', async () => {
    const repository = makeRepository()

    const result = await new ChequeService(repository).getAll('b1')

    expect(repository.getAll).toHaveBeenCalledWith('b1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
    expect(result[0].amount).toBe(100)
  })

  it('maps a repository row when fetching one cheque', async () => {
    const repository = makeRepository()

    const result = await new ChequeService(repository).getById('1')

    expect(repository.getById).toHaveBeenCalledWith('1')
    expect(result.id).toBe('1')
    expect(result.status).toBe('Issued')
  })

  it('persists and maps cheque creation', async () => {
    const repository = makeRepository()

    const result = await new ChequeService(repository).create(row)

    expect(repository.create).toHaveBeenCalledWith(row)
    expect(result.id).toBe('1')
    expect(result.type).toBe('Outward')
  })

  it('persists and maps cheque edits', async () => {
    const repository = makeRepository()

    const result = await new ChequeService(repository).update('1', {
      notes: 'Updated note',
    })

    expect(repository.update).toHaveBeenCalledWith('1', {
      notes: 'Updated note',
    })
    expect(result.id).toBe('1')
  })

  it('delegates deletion to the repository', async () => {
    const repository = makeRepository()

    await new ChequeService(repository).delete('1')

    expect(repository.delete).toHaveBeenCalledWith('1')
  })

  it('updates status when the transition is valid', async () => {
    const repo = {
      getById: vi.fn().mockResolvedValue({
        id: '1',
        business_id: 'b1',
        party_id: 'p1',
        account_id: 'a1',
        cheque_number: '100',
        amount: 100,
        cheque_date: '2025-01-01',
        deposit_date: null,
        remind_before_days: null,
        status: 'Issued',
        type: 'Outward',
        notes: null,
        image_url: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      }),
      updateStatus: vi.fn().mockResolvedValue({
        id: '1',
        business_id: 'b1',
        party_id: 'p1',
        account_id: 'a1',
        cheque_number: '100',
        amount: 100,
        cheque_date: '2025-01-01',
        deposit_date: null,
        remind_before_days: null,
        status: 'Cleared',
        type: 'Outward',
        notes: null,
        image_url: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      }),
    }

    const service = new ChequeService(repo as any)
    await service.updateStatus('1', 'Cleared')

    expect(repo.getById).toHaveBeenCalledWith('1')
    expect(repo.updateStatus).toHaveBeenCalledWith('1', 'Cleared')
  })

  it("throws when moving to the other cheque type's pending status", async () => {
    const repo = {
      getById: vi.fn().mockResolvedValue({
        id: '1',
        business_id: 'b1',
        party_id: 'p1',
        account_id: 'a1',
        cheque_number: '100',
        amount: 100,
        cheque_date: '2025-01-01',
        deposit_date: null,
        remind_before_days: null,
        status: 'Cleared',
        type: 'Outward',
        notes: null,
        image_url: null,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      }),
      updateStatus: vi.fn(),
    }

    const service = new ChequeService(repo as any)

    await expect(service.updateStatus('1', 'Received')).rejects.toThrow(
      'Cannot transition',
    )
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })
})
