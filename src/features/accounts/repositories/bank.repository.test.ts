import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseBankRepository } from './bank.repository'

const mocks = vi.hoisted(() => ({
  range: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  const query = {
    select: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: mocks.range,
  }
  mocks.from.mockReturnValue(query)
})

describe('bank repository', () => {
  it('fetches more than Supabase default row limit in stable pages', async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({
      id: String(index),
      name: `Bank ${index}`,
    }))
    mocks.range
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({
        data: [{ id: '1000', name: 'Last Bank' }],
        error: null,
      })
    const rows = await new SupabaseBankRepository().getAll()
    expect(rows).toHaveLength(1001)
    expect(mocks.range.mock.calls).toEqual([
      [0, 499],
      [500, 999],
      [1000, 1499],
    ])
  })

  it('does not return a partial catalog after a page fails', async () => {
    mocks.range.mockResolvedValueOnce({
      data: null,
      error: { message: 'Network failure', code: '500' },
    })
    await expect(new SupabaseBankRepository().getAll()).rejects.toThrow()
  })

  it('soft-deletes through the authorized database operation', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await new SupabaseBankRepository().delete('bank')
    expect(mocks.rpc).toHaveBeenCalledWith('delete_private_bank', {
      requested_id: 'bank',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
