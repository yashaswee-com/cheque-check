import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useAccountDetail } from './use-account-detail'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  getAllCheques: vi.fn(),
  updateStatus: vi.fn(),
}))

vi.mock('../services/account.service', () => ({
  accountService: { getById: mocks.getById },
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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAccountDetail('account-1', 'business-1'), {
    wrapper,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue({ id: 'account-1', account_name: 'Primary' })
  mocks.getAllCheques.mockResolvedValue([
    {
      id: 'cheque-1',
      account_id: 'account-1',
      cheque_number: '123',
      cheque_date: '2026-10-01',
      amount: 125,
      status: 'Issued',
    },
    {
      id: 'cheque-2',
      account_id: 'other-account',
      cheque_number: '456',
      cheque_date: '2026-10-02',
      amount: 250,
      status: 'Cleared',
    },
  ])
})

afterEach(cleanup)

describe('useAccountDetail', () => {
  it('combines the account with its filtered cheque list and related loading state', async () => {
    const { result } = setup()

    await waitFor(() => expect(result.current.account?.id).toBe('account-1'))
    expect(result.current.accountCheques.map(({ id }) => id)).toEqual([
      'cheque-1',
    ])
    expect(result.current.filteredCheques.map(({ id }) => id)).toEqual([
      'cheque-1',
    ])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
    result.current.updateChequeStatus('cheque-1', 'Cleared')
    expect(mocks.updateStatus).toHaveBeenCalledWith({
      id: 'cheque-1',
      status: 'Cleared',
    })
    expect(mocks.getById).toHaveBeenCalledWith('account-1')
    expect(mocks.getAllCheques).toHaveBeenCalledWith('business-1')
  })

  it('exposes an account query error and keeps the combined loading state settled', async () => {
    mocks.getById.mockRejectedValueOnce(new Error('Account unavailable'))
    const { result } = setup()

    await waitFor(() =>
      expect(result.current.error?.message).toBe('Account unavailable'),
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.account).toBeUndefined()
    expect(result.current.accountCheques).toHaveLength(1)
  })
})
