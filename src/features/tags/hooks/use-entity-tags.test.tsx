import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import {
  useEntityTags,
  useEntityTagsDraft,
  useEntityTagMap,
} from './use-entity-tags'

const service = vi.hoisted(() => ({
  getForEntity: vi.fn(),
  getTagMap: vi.fn(),
  syncForEntity: vi.fn(),
}))

vi.mock('@/features/tags/services/tag.service', () => ({
  tagService: service,
}))

function setup<T>(hook: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(hook, { wrapper }) }
}

beforeEach(() => {
  vi.resetAllMocks()
  service.getForEntity.mockResolvedValue([
    { id: 'tag-a', name: 'Urgent' },
    { id: 'tag-b', name: 'Follow up' },
  ])
  service.getTagMap.mockResolvedValue({ 'party-1': [{ id: 'tag-a' }] })
  service.syncForEntity.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('useEntityTags', () => {
  it('loads tags, persists a changed selection, and invalidates related caches', async () => {
    const { client, result } = setup(() => useEntityTags('party', 'party-1'))
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)

    await waitFor(() =>
      expect(result.current.tagIds).toEqual(['tag-a', 'tag-b']),
    )
    await act(() => result.current.saveTags(['tag-b', 'tag-c']))

    expect(service.getForEntity).toHaveBeenCalledWith('party', 'party-1')
    expect(service.syncForEntity).toHaveBeenCalledWith(
      'party',
      'party-1',
      ['tag-a', 'tag-b'],
      ['tag-b', 'tag-c'],
    )
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.entityTags.forEntity('party', 'party-1'),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.entityTagMap.all(),
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.tags.all() })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.tags.allDetail(),
    })
  })

  it('does not save or load when no entity id is available', async () => {
    const { result } = setup(() => useEntityTags('party', undefined))

    await act(() => result.current.saveTags(['tag-a']))

    expect(result.current.tags).toEqual([])
    expect(service.getForEntity).not.toHaveBeenCalled()
    expect(service.syncForEntity).not.toHaveBeenCalled()
  })
})

describe('useEntityTagsDraft', () => {
  it('commits only an explicitly changed local selection', async () => {
    const { result } = setup(() => useEntityTagsDraft('party', 'party-1'))
    await waitFor(() =>
      expect(result.current.tagIds).toEqual(['tag-a', 'tag-b']),
    )

    await act(() => result.current.commit())
    expect(service.syncForEntity).not.toHaveBeenCalled()

    act(() => result.current.setTagIds(['tag-b']))
    expect(result.current.tagIds).toEqual(['tag-b'])
    await act(() => result.current.commit())

    expect(service.syncForEntity).toHaveBeenCalledWith(
      'party',
      'party-1',
      ['tag-a', 'tag-b'],
      ['tag-b'],
    )
  })
})

describe('useEntityTagMap', () => {
  it('loads the all-business map for a null business id', async () => {
    const { result } = setup(() => useEntityTagMap(null, 'party'))

    await waitFor(() =>
      expect(result.current).toEqual({ 'party-1': [{ id: 'tag-a' }] }),
    )

    expect(service.getTagMap).toHaveBeenCalledWith(null, 'party')
  })

  it('does not query until the business scope is known', () => {
    setup(() => useEntityTagMap(undefined, 'party'))

    expect(service.getTagMap).not.toHaveBeenCalled()
  })
})
