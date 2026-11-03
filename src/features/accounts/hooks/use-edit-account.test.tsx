import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@/types'
import { queryKeys } from '@/lib/query-keys'
import { useEditAccount } from './use-edit-account'

const mocks = vi.hoisted(() => ({
  getById: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
}))
vi.mock('@/features/accounts/services/account.service', () => ({
  accountService: {
    getById: mocks.getById,
    update: mocks.update,
    delete: mocks.remove,
  },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))

const account: Account = {
  id: 'account-1',
  business_id: 'business-1',
  bank_id: null,
  account_name: 'Primary',
  account_number: '12345678',
  ifsc_code: null,
  notes: null,
  opening_balance: 0,
  is_default: false,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
}
const other: Account = { ...account, id: 'account-2', bank_id: 'bank-2' }

function setup(options?: Parameters<typeof useEditAccount>[2]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.accounts.list('business-1'), [account, other])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return {
    ...renderHook(() => useEditAccount(account.id, 'business-1', options), {
      wrapper,
    }),
    client,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getById.mockResolvedValue(account)
  mocks.update.mockResolvedValue(account)
  mocks.remove.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('useEditAccount', () => {
  it('clears the previous default optimistically and refreshes account detail caches', async () => {
    const { result, client } = setup()
    client.setQueryData(queryKeys.accounts.list('business-1'), [
      account,
      { ...other, is_default: true },
    ])
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await waitFor(() => expect(result.current.account?.id).toBe(account.id))
    let resolve!: (value: Account) => void
    mocks.update.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    act(() => {
      result.current.form.setValue('bank_id', 'bank-1')
      result.current.form.setValue('is_default', true)
    })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.onSubmit()
    })
    await waitFor(() => {
      const cached = client.getQueryData<Account[]>(
        queryKeys.accounts.list('business-1'),
      )!
      expect(
        cached.filter((row) => row.is_default).map((row) => row.id),
      ).toEqual([account.id])
    })
    await act(async () => {
      resolve({ ...account, is_default: true })
      await pending
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.accounts.allDetails(),
    })
  })
  it('restores the previous default when saving fails', async () => {
    const { result, client } = setup()
    const previous = [account, { ...other, is_default: true }]
    client.setQueryData(queryKeys.accounts.list('business-1'), previous)
    await waitFor(() => expect(result.current.account?.id).toBe(account.id))
    mocks.update.mockRejectedValueOnce(new Error('offline'))
    act(() => {
      result.current.form.setValue('bank_id', 'bank-1')
      result.current.form.setValue('is_default', true)
    })
    await act(async () => {
      await expect(result.current.onSubmit()).rejects.toThrow('offline')
    })
    expect(client.getQueryData(queryKeys.accounts.list('business-1'))).toEqual(
      previous,
    )
    expect(mocks.back).not.toHaveBeenCalled()
  })
  it('normalizes a missing bank id and saves account changes', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.account?.id).toBe(account.id))
    expect(result.current.form.getValues('bank_id')).toBe('')
    act(() => {
      result.current.form.setValue('bank_id', 'bank-1')
      result.current.form.setValue('account_name', 'Reserve')
    })
    await act(async () => result.current.onSubmit())

    expect(mocks.update).toHaveBeenCalledWith(
      account.id,
      expect.objectContaining({ account_name: 'Reserve' }),
    )
    expect(mocks.back).toHaveBeenCalledOnce()
  })
  it('runs the onSaved callback instead of navigating back', async () => {
    const onSaved = vi.fn()
    const { result } = setup({ onSaved })
    await waitFor(() => expect(result.current.account?.id).toBe(account.id))
    act(() => result.current.form.setValue('bank_id', 'bank-1'))
    await act(async () => result.current.onSubmit())
    expect(onSaved).toHaveBeenCalledOnce()
    expect(mocks.back).not.toHaveBeenCalled()
  })

  it('deletes an account and returns to the account list', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.account?.id).toBe(account.id))
    act(() => result.current.onDelete())

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(account.id))
    expect(mocks.push).toHaveBeenCalledWith('/accounts')
  })
})
