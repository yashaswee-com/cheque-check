import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  draftKeys,
  useDraft,
  useDraftCounts,
  useDrafts,
  useDraftsPage,
  useDeleteDraft,
} from './use-drafts'
import { useRedirectIfDraft } from './use-redirect-if-draft'

const mocks = vi.hoisted(() => ({
  service: { list: vi.fn(), getById: vi.fn(), delete: vi.fn() },
  replace: vi.fn(),
  pages: { list: vi.fn(), counts: vi.fn() },
}))
vi.mock('../repositories/draft-page.repository', () => ({
  draftPageRepository: mocks.pages,
}))
vi.mock('../services/draft.service', () => ({
  chequeDraftService: mocks.service,
  accountDraftService: mocks.service,
  partyDraftService: mocks.service,
}))
const router = { replace: mocks.replace }
vi.mock('next/navigation', () => ({ useRouter: () => router }))
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
  mocks.service.list.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }])
  mocks.service.getById.mockResolvedValue({ id: 'd1' })
  mocks.service.delete.mockResolvedValue(undefined)
})
afterEach(cleanup)
describe('draft query hooks', () => {
  it.each(['cheque', 'party', 'account'] as const)(
    'loads %s list and detail through the corresponding service',
    async (entity) => {
      const { wrapper } = setup()
      const { result } = renderHook(
        () => ({
          list: useDrafts(entity, 'b1'),
          detail: useDraft(entity, 'd1'),
        }),
        { wrapper },
      )
      await waitFor(() => expect(result.current.list.data).toHaveLength(2))
      await waitFor(() => expect(result.current.detail.data?.id).toBe('d1'))
      expect(mocks.service.list).toHaveBeenCalledWith('b1')
      expect(mocks.service.getById).toHaveBeenCalledWith('d1')
    },
  )
  it('disables queries without owners or ids', () => {
    const { wrapper } = setup()
    renderHook(
      () => ({
        list: useDrafts('party', undefined),
        detail: useDraft('party', null),
      }),
      { wrapper },
    )
    expect(mocks.service.list).not.toHaveBeenCalled()
    expect(mocks.service.getById).not.toHaveBeenCalled()
  })
  it('optimistically removes a draft, rolls back failures, and evicts detail cache on settlement', async () => {
    const { client, wrapper } = setup()
    const original = [{ id: 'd1' }, { id: 'd2' }]
    client.setQueryData(draftKeys.list('party', 'b1'), original)
    client.setQueryData(draftKeys.detail('party', 'd1'), original[0])
    const { result } = renderHook(() => useDeleteDraft('party', 'b1'), {
      wrapper,
    })
    let reject!: (error: Error) => void
    mocks.service.delete.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.mutateAsync('d1')
    })
    const caught = pending.catch((error: Error) => error)
    await waitFor(() =>
      expect(client.getQueryData(draftKeys.list('party', 'b1'))).toEqual([
        { id: 'd2' },
      ]),
    )
    await act(async () => {
      reject(new Error('delete failed'))
      await caught
    })
    expect(client.getQueryData(draftKeys.list('party', 'b1'))).toEqual(original)
    expect(client.getQueryData(draftKeys.detail('party', 'd1'))).toBeUndefined()
    await act(async () => result.current.mutateAsync('d1'))
    expect(client.getQueryData(draftKeys.list('party', 'b1'))).toEqual([
      { id: 'd2' },
    ])
  })
  it('loads a draft page and counts for the business', async () => {
    mocks.pages.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 50,
    })
    mocks.pages.counts.mockResolvedValue({ cheque: 1, party: 2, account: 0 })
    const request = {
      types: ['party' as const],
      search: 'a',
      ascending: true,
      page: 1,
    }
    const { wrapper } = setup()
    const { result } = renderHook(
      () => ({
        page: useDraftsPage('b1', request),
        counts: useDraftCounts('b1'),
        idle: useDraftsPage(undefined, request),
      }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.page.data?.page).toBe(1))
    await waitFor(() => expect(result.current.counts.data?.party).toBe(2))
    expect(mocks.pages.list).toHaveBeenCalledTimes(1)
    expect(mocks.pages.list).toHaveBeenCalledWith({
      ...request,
      businessId: 'b1',
    })
    expect(mocks.pages.counts).toHaveBeenCalledWith('b1')
  })
  it('optimistically removes a deleted draft from cached pages and restores it on failure', async () => {
    const { client, wrapper } = setup()
    const key = draftKeys.page('b1', {
      types: [],
      search: '',
      ascending: false,
      page: 0,
    })
    const page = {
      items: [
        { entity: 'party', draft: { id: 'd1' } },
        { entity: 'cheque', draft: { id: 'd2' } },
      ],
      total: 2,
      page: 0,
      page_size: 50,
    }
    client.setQueryData(key, page)
    mocks.service.delete.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useDeleteDraft('party', 'b1'), {
      wrapper,
    })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await act(async () => {
      await result.current.mutateAsync('d1').catch(() => undefined)
    })
    expect(client.getQueryData(key)).toEqual(page)
    await act(async () => result.current.mutateAsync('d1'))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drafts'] })
  })
  it('removes the draft from the page cache while the delete is pending', async () => {
    const { client, wrapper } = setup()
    const key = draftKeys.page('b1', {
      types: [],
      search: '',
      ascending: false,
      page: 0,
    })
    client.setQueryData(key, {
      items: [{ entity: 'party', draft: { id: 'd1' } }],
      total: 1,
      page: 0,
      page_size: 50,
    })
    mocks.service.delete.mockImplementationOnce(
      () => new Promise(() => undefined),
    )
    const { result } = renderHook(() => useDeleteDraft('party', 'b1'), {
      wrapper,
    })
    act(() => {
      void result.current.mutateAsync('d1')
    })
    await waitFor(() =>
      expect(client.getQueryData(key)).toMatchObject({ items: [], total: 0 }),
    )
  })
  it.each([
    ['cheque', '/cheques/create'],
    ['party', '/parties/create'],
    ['account', '/accounts/create'],
  ] as const)(
    'redirects incomplete %s records into their create flow',
    (entity, path) => {
      const { result, rerender } = renderHook(
        ({ draft }) =>
          useRedirectIfDraft(entity, { id: 'd1', is_draft: draft }),
        { initialProps: { draft: false } },
      )
      expect(result.current).toBe(false)
      expect(mocks.replace).not.toHaveBeenCalled()
      rerender({ draft: true })
      expect(result.current).toBe(true)
      expect(mocks.replace).toHaveBeenCalledWith(`${path}?draftId=d1`)
    },
  )
})
