import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Cheque as ChequeEntity } from '@/domain/cheque.entity'
import { queryKeys } from '@/lib/query-keys'
import { useChequeStatusMutation } from './use-cheque-status-mutation'
import { useChequeNumberConflict } from './use-cheque-number-conflict'
import { useRelatedCheques } from './use-related-cheques'

const mocks = vi.hoisted(() => ({
  updateStatus: vi.fn(),
  getAll: vi.fn(),
  hasNumberConflict: vi.fn(),
}))
vi.mock('../services/cheque.service', () => ({ chequeService: mocks }))
vi.mock('@/features/drafts/services/draft.service', () => ({
  chequeDraftService: { hasNumberConflict: mocks.hasNumberConflict },
}))

const original = ChequeEntity.fromRow({
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '000001',
  amount: 10,
  cheque_date: '2026-10-01',
  deposit_date: null,
  remind_before_days: null,
  status: 'Issued',
  type: 'Outward',
  notes: null,
  image_url: null,
  created_at: '2026-10-01',
  updated_at: '2026-10-01',
})
const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.resetAllMocks()
})

describe('canonical cheque hooks', () => {
  it('updates and rolls back both cache surfaces through the shared mutation', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.cheques.list('b1'), [original])
    client.setQueryData(queryKeys.cheques.detail('c1'), original)
    const pageKey = queryKeys.cheques.page({ businessId: 'b1', limit: 50 })
    const summaryKey = queryKeys.cheques.summary('b1', '2026-10-31', true, {})
    client.setQueryData(pageKey, {
      rows: [original],
      matchingCount: 1,
      activeCount: 1,
    })
    client.setQueryData(summaryKey, [])
    client.setQueryData(queryKeys.businesses.summaries('2026-10-31'), [])
    let reject!: (error: Error) => void
    mocks.updateStatus.mockImplementation(
      () =>
        new Promise((_, rejectPromise) => {
          reject = rejectPromise
        }),
    )
    const { result } = renderHook(() => useChequeStatusMutation('b1'), {
      wrapper,
    })
    const pending = result.current.mutateAsync({ id: 'c1', status: 'Cleared' })
    await waitFor(() => {
      const list = client.getQueryData<ChequeEntity[]>(
        queryKeys.cheques.list('b1'),
      )
      const detail = client.getQueryData<ChequeEntity>(
        queryKeys.cheques.detail('c1'),
      )
      expect(list?.[0].status).toBe('Cleared')
      expect(detail?.status).toBe('Cleared')
      expect(detail).toBeInstanceOf(ChequeEntity)
    })
    await act(async () => {
      reject(new Error('Database unavailable'))
      await expect(pending).rejects.toThrow('Database unavailable')
    })
    expect(client.getQueryData(queryKeys.cheques.list('b1'))).toEqual([
      original,
    ])
    expect(client.getQueryData(queryKeys.cheques.detail('c1'))).toBe(original)
    expect(mocks.updateStatus).toHaveBeenCalledWith('c1', 'Cleared')
    expect(client.getQueryState(pageKey)?.isInvalidated).toBe(true)
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(true)
    expect(
      client.getQueryState(queryKeys.businesses.summaries('2026-10-31'))
        ?.isInvalidated,
    ).toBe(true)
  })

  it('uses the same mutation when only a detail cache exists', async () => {
    const { client, wrapper } = setup()
    client.setQueryData(queryKeys.cheques.detail('c1'), original)
    const updated = ChequeEntity.fromRow({
      ...original.toJSON(),
      status: 'Bounced',
    })
    mocks.updateStatus.mockResolvedValue(updated)
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () => useChequeStatusMutation('b1', onSuccess),
      { wrapper },
    )
    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', status: 'Bounced' })
    })
    expect(
      client.getQueryData<ChequeEntity>(queryKeys.cheques.detail('c1'))?.status,
    ).toBe('Bounced')
    expect(client.getQueryData(queryKeys.cheques.list('b1'))).toBeUndefined()
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith(updated)
  })

  it('updates cheque status when no success callback is provided', async () => {
    const { wrapper } = setup()
    mocks.updateStatus.mockResolvedValue(original)
    const { result } = renderHook(() => useChequeStatusMutation('b1'), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', status: 'Cleared' })
    })

    expect(mocks.updateStatus).toHaveBeenCalledWith('c1', 'Cleared')
  })

  it('preserves unrelated list cheques and a mismatched but valid detail-cache entity', async () => {
    const { client, wrapper } = setup()
    const other = ChequeEntity.fromRow({
      ...original.toJSON(),
      id: 'c2',
      cheque_number: '000002',
      amount: 25,
    })
    client.setQueryData(queryKeys.cheques.list('b1'), [original, other])
    client.setQueryData(queryKeys.cheques.detail('c1'), other)
    const updated = ChequeEntity.fromRow({
      ...original.toJSON(),
      status: 'Cleared',
    })
    mocks.updateStatus.mockResolvedValue(updated)
    const { result } = renderHook(() => useChequeStatusMutation('b1'), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({ id: 'c1', status: 'Cleared' })
    })

    const list = client.getQueryData<ChequeEntity[]>(
      queryKeys.cheques.list('b1'),
    )
    expect(list?.[0].status).toBe('Cleared')
    expect(list?.[1]).toBe(other)
    expect(client.getQueryData(queryKeys.cheques.detail('c1'))).toBe(other)
  })

  it.each(['', '12345', '1234567', 'abcdef'])(
    'does not query a malformed number: %s',
    (number) => {
      const { wrapper } = setup()
      renderHook(() => useChequeNumberConflict('b1', 'a1', number), { wrapper })
      expect(mocks.hasNumberConflict).not.toHaveBeenCalled()
    },
  )

  it('queries valid numbers with the canonical cache key', async () => {
    const { client, wrapper } = setup()
    mocks.hasNumberConflict.mockResolvedValue(true)
    const { result } = renderHook(
      () => useChequeNumberConflict('b1', 'a1', '000001'),
      { wrapper },
    )
    await waitFor(() => expect(result.current.data).toBe(true))
    expect(mocks.hasNumberConflict).toHaveBeenCalledExactlyOnceWith(
      'b1',
      'a1',
      '000001',
    )
    expect(
      client.getQueryData(
        queryKeys.cheques.numberConflict('b1', 'a1', '000001'),
      ),
    ).toBe(true)
  })

  it.each(['party_id', 'account_id'] as const)(
    'shares related filtering and sorting for %s',
    async (field) => {
      const { client, wrapper } = setup()
      const other = ChequeEntity.fromRow({
        ...original.toJSON(),
        id: 'c2',
        amount: 50,
        cheque_date: '2026-10-02',
        status: 'Cleared',
      })
      const foreign = ChequeEntity.fromRow({
        ...original.toJSON(),
        id: 'c3',
        [field]: 'foreign',
      })
      client.setQueryData(queryKeys.cheques.list('b1'), [
        original,
        other,
        foreign,
      ])
      const { result } = renderHook(
        () => useRelatedCheques(field, original[field], 'b1'),
        { wrapper },
      )
      expect(result.current.relatedCheques).toEqual([original, other])
      expect(result.current.filteredCheques).toEqual([other, original])
      expect(result.current.outstanding).toBe(10)
      act(() => {
        result.current.setSortBy('amount')
        result.current.setSortOrder('asc')
      })
      expect(result.current.filteredCheques).toEqual([original, other])
      act(() => result.current.setFilter('Issued'))
      expect(result.current.filteredCheques).toEqual([original])
      act(() => result.current.setSearch('missing'))
      expect(result.current.filteredCheques).toEqual([])
    },
  )
})
