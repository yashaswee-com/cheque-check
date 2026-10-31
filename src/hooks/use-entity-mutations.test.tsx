import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEntityMutations } from './use-entity-mutations'

const monitor = vi.hoisted(() => ({ operation: vi.fn() }))
vi.mock('@/lib/monitoring/telemetry', () => ({
  monitorOperation: (name: string, operation: () => Promise<unknown>) => {
    monitor.operation(name)
    return operation()
  },
}))

describe('useEntityMutations', () => {
  it('uses the generic operation name and omits optional detail-cache synchronization', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () =>
        useEntityMutations<{ id: string }, { id: string }, { id: string }>({
          listQueryKey: ['custom-records', 'business-1'],
          update: {
            mutationFn: async (value) => value,
            updateList: (current) => current,
          },
          remove: {
            mutationFn: async () => undefined,
            updateList: (current) => current,
          },
        }),
      { wrapper },
    )

    await act(async () => {
      await result.current.updateMutation.mutateAsync({ id: 'item-1' })
      await result.current.deleteMutation.mutateAsync()
    })

    expect(monitor.operation).toHaveBeenCalledWith('entity.update')
    expect(monitor.operation).toHaveBeenCalledWith('entity.delete')
  })
})
