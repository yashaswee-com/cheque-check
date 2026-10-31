import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBusinessDetail } from './use-business-detail'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  useCheques: vi.fn(),
}))

vi.mock('../services/business.service', () => ({
  businessService: { getById: mocks.getById },
}))
vi.mock('@/features/cheques/hooks/use-cheques', () => ({
  useCheques: mocks.useCheques,
}))

const listState = {
  cheques: undefined as
    { id: string; status: string; amount: number }[] | undefined,
  filteredCheques: [] as { id: string }[],
  isLoading: false,
  error: undefined as Error | undefined,
  search: '',
  setSearch: vi.fn(),
  filter: 'All',
  setFilter: vi.fn(),
  sortBy: 'date',
  setSortBy: vi.fn(),
  sortOrder: 'desc',
  setSortOrder: vi.fn(),
  updateStatus: vi.fn(),
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useBusinessDetail('business-1'), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue({ id: 'business-1', name: 'Acme' })
  listState.cheques = undefined
  listState.filteredCheques = []
  listState.isLoading = false
  listState.error = undefined
  mocks.useCheques.mockImplementation(() => listState)
})

afterEach(cleanup)

describe('useBusinessDetail', () => {
  it('combines business data and reports zeroed statistics before cheques load', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.business?.id).toBe('business-1'))

    expect(result.current.stats).toEqual({
      total: 0,
      cleared: 0,
      pending: 0,
      bounced: 0,
      totalAmount: 0,
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it('computes status and amount summaries and forwards list controls/errors', async () => {
    const cheques = [
      { id: 'c1', status: 'Cleared', amount: 100 },
      { id: 'c2', status: 'Issued', amount: 250 },
      { id: 'c3', status: 'Received', amount: 300 },
      { id: 'c4', status: 'Bounced', amount: 50 },
    ]
    listState.cheques = cheques
    listState.filteredCheques = [cheques[1]]
    listState.isLoading = true
    listState.error = new Error('Cheque list unavailable')
    const { result } = setup()
    await waitFor(() => expect(result.current.business?.id).toBe('business-1'))

    expect(result.current.stats).toEqual({
      total: 4,
      cleared: 1,
      pending: 2,
      bounced: 1,
      totalAmount: 700,
    })
    expect(result.current.filteredCheques).toEqual([cheques[1]])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error?.message).toBe('Cheque list unavailable')
    expect(result.current.setSearch).toBe(listState.setSearch)
    expect(result.current.updateStatus).toBe(listState.updateStatus)
  })
})
