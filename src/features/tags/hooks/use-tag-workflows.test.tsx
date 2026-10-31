import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { useTags } from './use-tags'
import { useTagDetail, useTagList } from './use-tag-list'

const service = vi.hoisted(() => ({
  getAll: vi.fn(),
  getAllWithUsage: vi.fn(),
  getById: vi.fn(),
  getLinks: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))
vi.mock('../services/tag.service', () => ({ tagService: service }))
const tags = [
  {
    id: 't1',
    name: 'Urgent',
    color: '#ff0000',
    usage_count: 3,
    created_at: '2026-01-03',
  },
  {
    id: 't2',
    name: 'Archive',
    color: '#000000',
    usage_count: 0,
    created_at: '2026-01-01',
  },
]
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
  service.getAll.mockResolvedValue(tags)
  service.getAllWithUsage.mockResolvedValue(tags)
  service.getById.mockResolvedValue(tags[0])
  service.getLinks.mockResolvedValue([{ entity_id: 'c1' }])
  service.create.mockResolvedValue(tags[0])
  service.update.mockResolvedValue({ ...tags[0], name: 'Renamed' })
  service.delete.mockResolvedValue(undefined)
})
afterEach(cleanup)
describe('tag hooks', () => {
  it('loads, creates, updates detail cache, and deletes related cached surfaces', async () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTags('b1'), { wrapper })
    await waitFor(() => expect(result.current.tags).toHaveLength(2))
    await act(async () =>
      result.current.createTag({
        business_id: 'b1',
        name: 'Urgent',
        color: '#ff0000',
      }),
    )
    expect(service.create).toHaveBeenCalledWith({
      business_id: 'b1',
      name: 'Urgent',
      color: '#ff0000',
    })
    await act(async () =>
      result.current.updateTag({ id: 't1', input: { name: 'Renamed' } }),
    )
    expect(service.update).toHaveBeenCalledWith('t1', { name: 'Renamed' })
    expect(client.getQueryData(queryKeys.tags.detail('t1'))).toEqual({
      ...tags[0],
      name: 'Renamed',
    })
    await act(async () => result.current.deleteTag('t1'))
    expect(service.delete).toHaveBeenCalledWith('t1')
    expect(client.getQueryData(queryKeys.tags.detail('t1'))).toBeUndefined()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.entityTags.all(),
    })
  })
  it('disables unscoped lists and propagates mutation errors without success invalidation', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useTags(undefined), { wrapper })
    expect(result.current.tags).toEqual([])
    expect(service.getAll).not.toHaveBeenCalled()
    service.delete.mockRejectedValueOnce(new Error('delete failed'))
    await act(async () => {
      await expect(result.current.deleteTag('t1')).rejects.toThrow(
        'delete failed',
      )
    })
    expect(invalidate).not.toHaveBeenCalled()
  })
  it('filters/sorts usage lists and resets filters without resetting sorting', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useTagList('b1'), { wrapper })
    await waitFor(() => expect(result.current.tags).toHaveLength(2))
    expect(result.current.filteredTags.map(({ id }) => id)).toEqual([
      't2',
      't1',
    ])
    act(() => {
      result.current.setSortBy('usage')
      result.current.setSortOrder('desc')
      result.current.setSearch('URG')
      result.current.setColor('#ff0000')
      result.current.setUsage('used')
    })
    expect(result.current.filteredTags.map(({ id }) => id)).toEqual(['t1'])
    act(() => result.current.clearFilters())
    expect(result.current.search).toBe('')
    expect(result.current.color).toBeNull()
    expect(result.current.usage).toBe('all')
    expect(result.current.sortBy).toBe('usage')
    expect(result.current.filteredTags.map(({ id }) => id)).toEqual([
      't1',
      't2',
    ])
  })
  it('loads detail and links together and exposes a link query failure', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useTagDetail('t1'), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tag).toEqual(tags[0])
    expect(result.current.links).toEqual([{ entity_id: 'c1' }])
    expect(service.getById).toHaveBeenCalledWith('t1')
    expect(service.getLinks).toHaveBeenCalledWith('t1')
    service.getLinks.mockRejectedValueOnce(new Error('links failed'))
    const other = setup()
    const failed = renderHook(() => useTagDetail('t2'), {
      wrapper: other.wrapper,
    })
    await waitFor(() =>
      expect(failed.result.current.error?.message).toBe('links failed'),
    )
    expect(failed.result.current.links).toEqual([])
  })
})
