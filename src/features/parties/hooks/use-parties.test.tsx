import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useParties } from './use-parties'

const mocks = vi.hoisted(() => ({
  getParties: vi.fn(),
  getCheques: vi.fn(),
}))

vi.mock('@/features/parties/services/party.service', () => ({
  partyService: { getAll: mocks.getParties },
}))

vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: { getAll: mocks.getCheques },
}))

const parties = [
  { id: 'p1', name: 'Acme Co', contact: '1111111111' },
  { id: 'p2', name: 'Beta Ltd', contact: '2222222222' },
  { id: 'p3', name: 'Gamma Co', contact: '3333333333' },
]

const cheques = [
  { party_id: 'p1', amount: 100, status: 'Issued' },
  { party_id: 'p1', amount: 500, status: 'Cleared' },
  { party_id: 'p1', amount: 50, status: 'Bounced' },
  { party_id: 'p2', amount: 300, status: 'Received' },
  { party_id: 'p3', amount: 25, status: 'Bounced' },
]

function setup(businessId: string | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useParties(businessId), { wrapper })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getParties.mockResolvedValue(parties)
  mocks.getCheques.mockResolvedValue(cheques)
})

afterEach(() => {
  cleanup()
})

describe('useParties', () => {
  it('has a zero balance while cheque data is unavailable and surfaces party failures', async () => {
    mocks.getCheques.mockRejectedValueOnce(new Error('cheques offline'))
    mocks.getParties.mockRejectedValueOnce(new Error('parties offline'))
    const { result } = setup('b1')
    expect(result.current.getBalance('p1')).toBe(0)
    await waitFor(() =>
      expect(result.current.error?.message).toBe('parties offline'),
    )
    expect(result.current.filteredParties).toEqual([])
    expect(result.current.getBalance('unknown')).toBe(0)
  })
  it('loads parties and computes pending balances excluding cleared and bounced cheques', async () => {
    const { result } = setup('business-1')

    await waitFor(() => expect(result.current.parties).toEqual(parties))

    expect(result.current.getBalance('p1')).toBe(100)
    expect(result.current.getBalance('p2')).toBe(300)
    expect(result.current.getBalance('p3')).toBe(0)
    expect(mocks.getParties).toHaveBeenCalledWith('business-1')
    expect(mocks.getCheques).toHaveBeenCalledWith('business-1')
  })

  it('filters by case-insensitive name or contact number', async () => {
    const { result } = setup('business-1')
    await waitFor(() => expect(result.current.parties).toEqual(parties))

    act(() => result.current.setSearch('BETA'))
    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p2',
    ])

    act(() => result.current.setSearch('3333'))
    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p3',
    ])
  })

  it('sorts names and balances in either direction', async () => {
    const { result } = setup('business-1')
    await waitFor(() => expect(result.current.parties).toEqual(parties))

    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ])

    act(() => {
      result.current.setSortOrder('desc')
      result.current.setSortBy('name')
    })
    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p3',
      'p2',
      'p1',
    ])

    act(() => {
      result.current.setSortOrder('asc')
      result.current.setSortBy('balance')
    })
    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p3',
      'p1',
      'p2',
    ])

    act(() => result.current.setSortOrder('desc'))
    expect(result.current.filteredParties.map((party) => party.id)).toEqual([
      'p2',
      'p1',
      'p3',
    ])
  })

  it('does not fetch data until a business is selected', () => {
    const { result } = setup(undefined)

    expect(result.current.filteredParties).toEqual([])
    expect(mocks.getParties).not.toHaveBeenCalled()
    expect(mocks.getCheques).not.toHaveBeenCalled()
  })
})
