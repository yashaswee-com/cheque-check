import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useOptimisticMutation } from './use-optimistic-mutation'

describe('useOptimisticMutation', () => {
  it('updates and restores both the list and detail cache when a mutation fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const originalList = [{ id: 'c1', status: 'Issued' }]
    const originalDetail = { id: 'c1', status: 'Issued' }
    queryClient.setQueryData(['cheques', 'b1'], originalList)
    queryClient.setQueryData(['cheque', 'c1'], originalDetail)

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    let rejectMutation: (reason?: unknown) => void = () => undefined
    const mutationFn = vi.fn().mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectMutation = reject
        }),
    )
    const { result } = renderHook(
      () =>
        useOptimisticMutation<
          { id: string; status: string }[],
          { id: string; status: string },
          { id: string; status: string }
        >({
          queryKey: ['cheques', 'b1'],
          additionalQueryKeys: [['cheque', 'c1']],
          additionalMutations: [
            {
              queryKey: ['cheque', 'c1'],
              update: (current, variables) =>
                current && current.id === variables.id
                  ? { ...current, status: variables.status }
                  : current,
            },
          ],
          mutationFn,
          update: (current, variables) =>
            current?.map((item) =>
              item.id === variables.id
                ? { ...item, status: variables.status }
                : item,
            ),
        }),
      { wrapper },
    )

    const mutatePromise = result.current.mutateAsync({
      id: 'c1',
      status: 'Cleared',
    })
    await waitFor(() => {
      expect(queryClient.getQueryData(['cheques', 'b1'])).toEqual([
        { id: 'c1', status: 'Cleared' },
      ])
      expect(queryClient.getQueryData(['cheque', 'c1'])).toEqual({
        id: 'c1',
        status: 'Cleared',
      })
    })

    await act(async () => {
      rejectMutation(new Error('sync failed'))
      await expect(mutatePromise).rejects.toThrow('sync failed')
    })
    await waitFor(() => {
      expect(queryClient.getQueryData(['cheques', 'b1'])).toEqual(originalList)
      expect(queryClient.getQueryData(['cheque', 'c1'])).toEqual(originalDetail)
    })
  })

  it('invalidates only ordinary entity keys when a mutation succeeds', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidate = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useOptimisticMutation<string[], string, string>({
          queryKey: ['accounts', 'business-1'],
          mutationFn: async (value) => value,
          update: (current, value) => [...(current ?? []), value],
        }),
      { wrapper },
    )

    await act(async () => result.current.mutateAsync('account-1'))
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({
      queryKey: ['accounts', 'business-1'],
    })
  })

  it('supports cheque invalidation keys without a business identifier', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useOptimisticMutation<string[], string, string>({
          queryKey: queryKeys.cheques.list(undefined),
          mutationFn: async (value) => value,
          update: (current, value) => [...(current ?? []), value],
        }),
      { wrapper },
    )

    await act(async () => result.current.mutateAsync('cheque-1'))
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.some((part) => part === 'cheques')),
    ).toBe(true)
  })

  it('runs error callbacks with an empty context when optimistic updates fail', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const onError = vi.fn()
    const failure = new Error('optimistic update failed')
    const { result } = renderHook(
      () =>
        useOptimisticMutation<string[], string, string>({
          queryKey: ['accounts', 'business-1'],
          mutationFn: async (value) => value,
          update: () => {
            throw failure
          },
          onError,
        }),
      { wrapper },
    )

    await act(async () => {
      await expect(result.current.mutateAsync('account-1')).rejects.toBe(
        failure,
      )
    })

    expect(onError).toHaveBeenCalledWith(failure, 'account-1', undefined)
  })
})
