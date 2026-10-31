import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChequeWithRelations } from '@/types'
import { useCheques } from './use-cheques'

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  updateStatus: vi.fn(),
  deleteMutation: vi.fn(),
  profile: null as { received_cheques_enabled?: boolean } | null,
}))

vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: { getAll: mocks.getAll },
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: mocks.profile }),
}))
vi.mock('./use-cheque-status-mutation', () => ({
  useChequeStatusMutation: () => ({
    mutate: mocks.updateStatus,
    isPending: false,
  }),
}))
vi.mock('@/hooks/use-optimistic-mutation', () => ({
  useOptimisticMutation: () => ({
    mutate: mocks.deleteMutation,
    isPending: false,
  }),
}))

const fixtures = [
  {
    id: 'c1',
    cheque_number: '000001',
    cheque_date: '2026-01-03',
    amount: 500,
    status: 'Issued',
    type: 'Outward',
    party: { name: 'Acme' },
  },
  {
    id: 'c2',
    cheque_number: '000002',
    cheque_date: '2026-01-01',
    amount: 1500,
    status: 'Cleared',
    type: 'Outward',
    party: { name: 'Beta' },
  },
  {
    id: 'c3',
    cheque_number: '000003',
    cheque_date: '2026-01-02',
    amount: 250,
    status: 'Received',
    type: 'Inward',
    party: { name: 'Acme' },
  },
] as unknown as ChequeWithRelations[]

function setup(businessId: string | undefined = 'business-1') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useCheques(businessId), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.profile = null
  mocks.getAll.mockResolvedValue(fixtures)
})

afterEach(cleanup)

describe('useCheques', () => {
  it('loads all cheque types and filters by query, status, and amount', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.cheques).toHaveLength(3))

    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual([
      'c1',
      'c3',
      'c2',
    ])
    act(() => result.current.setSearch('ACME'))
    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual([
      'c1',
      'c3',
    ])
    act(() => {
      result.current.setSearch('1500')
      result.current.setFilter('Cleared')
    })
    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual(['c2'])
  })

  it('respects direction filters, excludes inward cheques when disabled, and sorts by amount', async () => {
    mocks.profile = { received_cheques_enabled: false }
    const { result } = setup()
    await waitFor(() => expect(result.current.cheques).toHaveLength(2))

    expect(result.current.cheques.map(({ id }) => id)).toEqual(['c1', 'c2'])
    act(() => {
      result.current.setSortBy('amount')
      result.current.setSortOrder('asc')
    })
    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual([
      'c1',
      'c2',
    ])
    act(() => result.current.setSortOrder('desc'))
    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual([
      'c2',
      'c1',
    ])
  })

  it('keeps the query disabled without a business and exposes query failures', async () => {
    const idle = setup('')
    expect(idle.result.current.isLoading).toBe(false)
    expect(idle.result.current.cheques).toEqual([])
    expect(mocks.getAll).not.toHaveBeenCalled()
    idle.unmount()

    mocks.getAll.mockRejectedValueOnce(new Error('Could not load cheques'))
    const failed = setup()
    await waitFor(() => expect(failed.result.current.error).toBeTruthy())
    expect(failed.result.current.isLoading).toBe(false)
    expect(failed.result.current.cheques).toEqual([])
  })

  it('delegates status updates and deletion to their mutations', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.cheques).toHaveLength(3))

    act(() => {
      result.current.updateStatus('c1', 'Cleared')
      result.current.deleteCheque('c2')
    })

    expect(mocks.updateStatus).toHaveBeenCalledWith({
      id: 'c1',
      status: 'Cleared',
    })
    expect(mocks.deleteMutation).toHaveBeenCalledWith('c2')
    expect(result.current.isUpdating).toBe(false)
  })
})
