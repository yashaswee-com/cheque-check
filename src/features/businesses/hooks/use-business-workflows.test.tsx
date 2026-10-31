import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { BusinessProvider, useBusiness } from './use-business'
import { useBusinesses } from './use-businesses-page'
import { useCreateBusiness } from './use-create-business'

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getCheques: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  push: vi.fn(),
  celebrate: vi.fn(),
}))
vi.mock('../services/business.service', () => ({ businessService: mocks }))
vi.mock('@/features/cheques/services/cheque.service', () => ({
  chequeService: { getBusinessSummaries: mocks.getCheques },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/lib/celebrate', () => ({ queueCelebration: mocks.celebrate }))

const businesses = [
  { id: 'b1', name: 'Alpha', email: null },
  { id: 'b2', name: 'Beta', email: 'office@example.com' },
] as Business[]

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BusinessProvider>{children}</BusinessProvider>
    </QueryClientProvider>
  )
  return { client, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getAll.mockResolvedValue(businesses)
  mocks.getCheques.mockResolvedValue([
    { business_id: 'b1', upcoming_total: 100 },
    { business_id: 'b2', upcoming_total: 500 },
  ])
  mocks.create.mockResolvedValue({ id: 'created', name: 'New Business' })
  mocks.delete.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('business hooks', () => {
  it('handles absent summaries, nonmatching searches and ascending upcoming totals', async () => {
    mocks.getCheques.mockResolvedValueOnce([])
    const { wrapper } = setup()
    const { result } = renderHook(() => useBusinesses(), { wrapper })
    await waitFor(() => expect(result.current.businesses).toHaveLength(2))
    expect(result.current.getUpcomingTotal('absent')).toBe(0)
    act(() => result.current.setSearch('not-present'))
    expect(result.current.filteredBusinesses).toEqual([])
    act(() => {
      result.current.setSearch('')
      result.current.setSortOrder('desc')
    })
    expect(result.current.filteredBusinesses.map(({ id }) => id)).toEqual([
      'b2',
      'b1',
    ])
    act(() => {
      result.current.setSortBy('upcoming')
      result.current.setSortOrder('asc')
    })
    expect(result.current.filteredBusinesses).toHaveLength(2)
  })
  it('requires the provider, selects the first business and falls back after deletion', async () => {
    expect(() => renderHook(() => useBusiness())).toThrow('BusinessProvider')
    const { wrapper, client } = setup()
    const { result } = renderHook(() => useBusiness(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.activeBusiness?.id).toBe('b1'))
    act(() => result.current.setActiveBusiness(businesses[1]))
    expect(result.current.activeBusiness?.id).toBe('b2')
    act(() => client.setQueryData(queryKeys.businesses.all(), [businesses[0]]))
    await waitFor(() => expect(result.current.activeBusiness?.id).toBe('b1'))
    act(() => client.setQueryData(queryKeys.businesses.all(), []))
    await waitFor(() => expect(result.current.activeBusiness).toBeNull())
  })

  it('aggregates upcoming pending cheques across businesses and filters/sorts them', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useBusinesses(), { wrapper })
    await waitFor(() => expect(result.current.getUpcomingTotal('b2')).toBe(500))
    expect(result.current.getUpcomingTotal('b1')).toBe(100)
    expect(mocks.getCheques).toHaveBeenCalledWith(
      new Date().toISOString().split('T')[0],
    )
    expect(mocks.getCheques).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.setSortBy('upcoming')
      result.current.setSortOrder('desc')
    })
    expect(result.current.filteredBusinesses.map(({ id }) => id)).toEqual([
      'b2',
      'b1',
    ])
    act(() => result.current.setSearch('OFFICE'))
    expect(result.current.filteredBusinesses.map(({ id }) => id)).toEqual([
      'b2',
    ])
    act(() => {
      result.current.setSearch('')
      result.current.setSortBy('name')
      result.current.setSortOrder('asc')
    })
    expect(result.current.filteredBusinesses.map(({ id }) => id)).toEqual([
      'b1',
      'b2',
    ])
  })

  it('deletes a business and invalidates the business cache, propagating failures', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useBusinesses(), { wrapper })
    await waitFor(() => expect(result.current.businesses).toHaveLength(2))
    await act(async () => result.current.deleteBusiness('b1'))
    expect(mocks.delete).toHaveBeenCalledWith('b1')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.businesses.all(),
    })
    mocks.delete.mockRejectedValueOnce(new Error('delete failed'))
    await act(async () => {
      await expect(result.current.deleteBusiness('b2')).rejects.toThrow(
        'delete failed',
      )
    })
    expect(result.current.isDeleting).toBe(false)
  })

  it('validates business wizard steps and creates with normalized optional fields', async () => {
    const { wrapper } = setup()
    const onCreated = vi.fn()
    const { result } = renderHook(() => useCreateBusiness({ onCreated }), {
      wrapper,
    })
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(1)
    act(() => result.current.form.setValue('name', 'New Business'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)
    act(() => result.current.form.setValue('email', 'invalid'))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(2)
    act(() => result.current.form.setValue('email', ''))
    await act(async () => result.current.nextStep())
    expect(result.current.step).toBe(3)
    act(() => result.current.prevStep())
    expect(result.current.step).toBe(2)
    await act(async () => result.current.onSubmit())
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Business',
        email: null,
        phone: null,
        address: null,
        logo_url: null,
      }),
    )
    expect(onCreated).toHaveBeenCalledWith({
      id: 'created',
      name: 'New Business',
    })
    expect(mocks.celebrate).toHaveBeenCalledWith({ target: '/businesses' })
    expect(result.current.isSuccess).toBe(true)
    act(() => result.current.continueAfterSuccess())
    expect(mocks.push).toHaveBeenCalledWith('/businesses')
  })
})
