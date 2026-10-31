import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useBankMutations, useBanks } from './use-banks'

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/features/accounts/services/bank.service', () => ({
  bankService: mocks,
}))

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getAll.mockResolvedValue([{ id: 'bank-1', name: 'Example Bank' }])
  mocks.create.mockResolvedValue({ id: 'bank-2', name: 'New Bank' })
  mocks.delete.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('bank hooks', () => {
  it('loads the bank catalog', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useBanks(), { wrapper })

    await waitFor(() =>
      expect(result.current.data).toEqual([
        { id: 'bank-1', name: 'Example Bank' },
      ]),
    )
    expect(mocks.getAll).toHaveBeenCalledOnce()
  })

  it('creates and removes banks, invalidating the catalog after each change', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useBankMutations(), { wrapper })

    await act(async () => result.current.create.mutateAsync('New Bank'))
    expect(mocks.create).toHaveBeenCalledWith('New Bank')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.banks.list(),
    })

    await act(async () => result.current.remove.mutateAsync('bank-2'))
    expect(mocks.delete).toHaveBeenCalledWith('bank-2')
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenLastCalledWith({
      queryKey: queryKeys.banks.list(),
    })
  })

  it('surfaces bank-load and mutation errors to their callers', async () => {
    mocks.getAll.mockRejectedValueOnce(new Error('Catalog unavailable'))
    const { wrapper } = setup()
    const query = renderHook(() => useBanks(), { wrapper })
    await waitFor(() => expect(query.result.current.error).toBeTruthy())
    expect(query.result.current.error?.message).toBe('Catalog unavailable')
    query.unmount()

    const mutation = renderHook(() => useBankMutations(), { wrapper })
    mocks.create.mockRejectedValueOnce(new Error('Create failed'))
    await act(async () => {
      await expect(
        mutation.result.current.create.mutateAsync('Bad Bank'),
      ).rejects.toThrow('Create failed')
    })
    expect(mutation.result.current.create.isPending).toBe(false)
  })
})
