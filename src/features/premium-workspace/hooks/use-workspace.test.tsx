import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useWorkspaceContext, useWorkspaceTools } from './use-workspace'
import { useWorkspaceAction } from './use-workspace-action'

const mocks = vi.hoisted(() => ({ context: vi.fn(), tools: vi.fn() }))
vi.mock('../services/workspace.service', () => ({
  premiumWorkspaceService: mocks,
}))

const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  clients.push(client)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.resetAllMocks()
})

describe('shared workspace hooks', () => {
  it('reuses the same context and tool cache across consumers', async () => {
    const { wrapper, client } = setup()
    const context = { parties: [], accounts: [], cheques: [] }
    mocks.context.mockResolvedValue(context)
    mocks.tools.mockResolvedValue([])
    const first = renderHook(
      () => ({
        context: useWorkspaceContext('b1'),
        tools: useWorkspaceTools('b1'),
      }),
      { wrapper },
    )
    await waitFor(() =>
      expect(first.result.current.context.data).toEqual(context),
    )
    await waitFor(() => expect(first.result.current.tools.data).toEqual([]))
    renderHook(
      () => ({
        context: useWorkspaceContext('b1'),
        tools: useWorkspaceTools('b1'),
      }),
      { wrapper },
    )
    expect(mocks.context).toHaveBeenCalledExactlyOnceWith('b1')
    expect(mocks.tools).toHaveBeenCalledExactlyOnceWith('b1')
    expect(
      client.getQueryData(queryKeys.premiumWorkspace.context('b1')),
    ).toEqual(context)
  })

  it('does not load disabled tools or an unspecified business', () => {
    const { wrapper } = setup()
    renderHook(
      () => {
        useWorkspaceContext(undefined)
        useWorkspaceTools('b1', false)
      },
      { wrapper },
    )
    expect(mocks.context).not.toHaveBeenCalled()
    expect(mocks.tools).not.toHaveBeenCalled()
  })

  it('blocks concurrent execution and refreshes caches after success', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    let finish!: () => void
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { result } = renderHook(useWorkspaceAction, { wrapper })
    let pending!: Promise<void>
    act(() => {
      pending = result.current.run(action)
    })
    expect(result.current.busy).toBe(true)
    await act(async () => {
      await result.current.run(action)
    })
    expect(action).toHaveBeenCalledOnce()
    await act(async () => {
      finish()
      await pending
    })
    expect(result.current.busy).toBe(false)
    expect(result.current.notice).toBe('success')
    expect(invalidate).toHaveBeenCalledExactlyOnceWith()
  })

  it('surfaces errors and releases the execution lock', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(useWorkspaceAction, { wrapper })
    await act(async () => {
      await result.current.run(async () => {
        throw new Error('RPC failed')
      })
    })
    expect(result.current.notice).toBe('error')
    expect(result.current.busy).toBe(false)
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.premiumWorkspace.all(),
    })
    await act(async () => {
      await result.current.run(async () => undefined)
    })
    expect(result.current.notice).toBe('success')
  })
})
