import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePartyDetail } from './use-party-detail'
import { useParty } from './use-party'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getAllCheques: vi.fn(),
  updateStatus: vi.fn(),
}))

vi.mock('../services/party.service', () => ({
  partyService: { getById: mocks.getById },
}))
vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: { getAll: mocks.getAllCheques },
}))
vi.mock('@/features/cheques/hooks/use-cheque-status-mutation', () => ({
  useChequeStatusMutation: () => ({
    mutate: mocks.updateStatus,
    isPending: false,
  }),
}))

function setup<T>(callback: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(callback, { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue({ id: 'party-1', name: 'Acme' })
  mocks.getAllCheques.mockResolvedValue([
    {
      id: 'cheque-1',
      party_id: 'party-1',
      cheque_number: '123',
      cheque_date: '2026-10-01',
      amount: 125,
      status: 'Issued',
    },
    {
      id: 'cheque-2',
      party_id: 'other-party',
      cheque_number: '456',
      cheque_date: '2026-10-02',
      amount: 250,
      status: 'Cleared',
    },
  ])
})

afterEach(cleanup)

describe('party detail hooks', () => {
  it('loads a party by id and disables the query when no id is selected', async () => {
    const loaded = setup(() => useParty('party-1'))
    await waitFor(() => expect(loaded.result.current.data?.id).toBe('party-1'))
    expect(mocks.getById).toHaveBeenCalledWith('party-1')
    loaded.unmount()

    const idle = setup(() => useParty(undefined))
    expect(idle.result.current.isLoading).toBe(false)
    expect(idle.result.current.data).toBeUndefined()
    expect(mocks.getById).toHaveBeenCalledOnce()
  })

  it('combines party and related cheques with query errors and loading', async () => {
    const detail = setup(() => usePartyDetail('party-1', 'business-1'))
    await waitFor(() => expect(detail.result.current.party?.id).toBe('party-1'))
    expect(detail.result.current.partyCheques.map(({ id }) => id)).toEqual([
      'cheque-1',
    ])
    expect(detail.result.current.outstanding).toBe(125)
    expect(detail.result.current.isLoading).toBe(false)
    detail.result.current.updateChequeStatus('cheque-1', 'Cleared')
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      id: 'cheque-1',
      status: 'Cleared',
    })

    detail.unmount()
    mocks.getById.mockRejectedValueOnce(new Error('Party unavailable'))
    const failed = setup(() => usePartyDetail('party-1', undefined))
    await waitFor(() =>
      expect(failed.result.current.error?.message).toBe('Party unavailable'),
    )
    expect(failed.result.current.isLoading).toBe(false)
    expect(failed.result.current.partyCheques).toEqual([])
  })
})
