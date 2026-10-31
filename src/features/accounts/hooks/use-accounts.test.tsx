import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccounts } from './use-accounts'

const getAll = vi.hoisted(() => vi.fn())
vi.mock('../services/account.service', () => ({ accountService: { getAll } }))
const accounts = [
  {
    id: 'a1',
    account_name: 'Zebra',
    account_number: '111',
    bank_id: 'bank1',
    bank: { name: 'Alpha Bank' },
  },
  {
    id: 'a2',
    account_name: 'Alpha',
    account_number: '222',
    bank_id: 'bank2',
    bank: { name: 'Beta Bank' },
  },
  {
    id: 'a3',
    account_name: 'Middle',
    account_number: '333',
    bank_id: 'bank1',
    bank: { name: 'Alpha Bank' },
  },
  {
    id: 'a4',
    account_name: 'No bank',
    account_number: '444',
    bank_id: null,
    bank: null,
  },
]
function setup(businessId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAccounts(businessId), { wrapper })
}
beforeEach(() => {
  vi.resetAllMocks()
  getAll.mockResolvedValue(accounts)
})
afterEach(cleanup)

describe('useAccounts', () => {
  it('loads business accounts, deduplicates banks and sorts names without mutating cache order', async () => {
    const { result } = setup('b1')
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.accounts).toHaveLength(4))
    expect(getAll).toHaveBeenCalledWith('b1')
    expect(result.current.uniqueBanks).toEqual([
      { id: 'bank1', name: 'Alpha Bank' },
      { id: 'bank2', name: 'Beta Bank' },
    ])
    expect(result.current.filteredAccounts.map(({ id }) => id)).toEqual([
      'a2',
      'a3',
      'a4',
      'a1',
    ])
    expect(result.current.accounts?.map(({ id }) => id)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ])
    act(() => result.current.setSortOrder('desc'))
    expect(result.current.filteredAccounts.map(({ id }) => id)).toEqual([
      'a1',
      'a4',
      'a3',
      'a2',
    ])
  })
  it('combines name/bank/number searches with bank filters and bank-name sorting', async () => {
    const { result } = setup('b1')
    await waitFor(() => expect(result.current.accounts).toHaveLength(4))
    act(() => {
      result.current.setSearch('ALPHA BANK')
      result.current.setBankFilter('bank1')
    })
    expect(result.current.filteredAccounts).toHaveLength(2)
    act(() => {
      result.current.setSearch('333')
    })
    expect(result.current.filteredAccounts.map(({ id }) => id)).toEqual(['a3'])
    act(() => {
      result.current.setSearch('')
      result.current.setBankFilter('All')
      result.current.setSortBy('bank_name')
    })
    expect(result.current.filteredAccounts.map(({ id }) => id)).toEqual([
      'a4',
      'a1',
      'a3',
      'a2',
    ])
    act(() => result.current.setSortOrder('desc'))
    expect(result.current.filteredAccounts.map(({ id }) => id)).toEqual([
      'a2',
      'a1',
      'a3',
      'a4',
    ])
  })
  it('does not fetch without a business and exposes failures with empty derived lists', async () => {
    const idle = setup()
    expect(idle.result.current.filteredAccounts).toEqual([])
    expect(idle.result.current.uniqueBanks).toEqual([])
    expect(getAll).not.toHaveBeenCalled()
    idle.unmount()
    getAll.mockRejectedValueOnce(new Error('load failed'))
    const { result } = setup('b1')
    await waitFor(() =>
      expect(result.current.error?.message).toBe('load failed'),
    )
    expect(result.current.filteredAccounts).toEqual([])
  })
})
