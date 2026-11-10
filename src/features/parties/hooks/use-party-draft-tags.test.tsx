import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePartyDraftTags } from './use-party-draft-tags'

const { getForEntity, syncForEntity } = vi.hoisted(() => ({
  getForEntity: vi.fn(),
  syncForEntity: vi.fn(),
}))

vi.mock('@/features/tags/services/tag.service', () => ({
  tagService: { getForEntity, syncForEntity },
}))

beforeEach(() => {
  vi.clearAllMocks()
  getForEntity.mockResolvedValue([])
  syncForEntity.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('party draft tags', () => {
  it('restores tags linked to a resumed party draft', async () => {
    getForEntity.mockResolvedValue([{ id: 'tag-1' }])
    const { result } = renderHook(() => usePartyDraftTags('party-draft'))
    await waitFor(() => expect(result.current.tagIds).toEqual(['tag-1']))
  })

  it('persists selection to the party draft and flushes before publication', async () => {
    getForEntity.mockResolvedValue([{ id: 'existing-tag' }])
    const { result } = renderHook(() => usePartyDraftTags('party-draft'))
    await waitFor(() => expect(result.current.tagIds).toEqual(['existing-tag']))
    act(() => result.current.setTagIds(['tag-1', 'tag-2']))
    await act(async () => result.current.flush('party-draft'))
    expect(syncForEntity).toHaveBeenCalledWith(
      'party',
      'party-draft',
      ['existing-tag'],
      ['tag-1', 'tag-2'],
    )
  })

  it('retains tag selections made before an autosaved draft receives an id', async () => {
    const { result, rerender } = renderHook(
      ({ draftId }: { draftId: string | null }) => usePartyDraftTags(draftId),
      { initialProps: { draftId: null as string | null } },
    )
    act(() => result.current.setTagIds(['tag-1']))
    rerender({ draftId: 'new-party-draft' })
    await waitFor(() =>
      expect(syncForEntity).toHaveBeenCalledWith(
        'party',
        'new-party-draft',
        [],
        ['tag-1'],
      ),
    )
  })

  it('retains a failed hydration and refuses to overwrite links during flush', async () => {
    const failure = new Error('Tag links unavailable')
    getForEntity.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => usePartyDraftTags('party-draft'))

    await expect(result.current.flush('party-draft')).rejects.toBe(failure)
    act(() => result.current.setTagIds(['tag-1']))
    await expect(result.current.flush('party-draft')).rejects.toBe(failure)
    expect(syncForEntity).not.toHaveBeenCalled()
  })

  it('does not apply stale tags after changing draft targets during loading', async () => {
    let finishLoad!: (tags: { id: string }[]) => void
    getForEntity.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )
    const { result, rerender } = renderHook(
      ({ draftId }: { draftId: string }) => usePartyDraftTags(draftId),
      { initialProps: { draftId: 'old-party-draft' } },
    )

    rerender({ draftId: 'new-party-draft' })
    await act(async () => finishLoad([{ id: 'stale-tag' }]))
    await waitFor(() => expect(result.current.tagIds).toEqual([]))
    expect(getForEntity).toHaveBeenNthCalledWith(2, 'party', 'new-party-draft')
  })

  it('flushes safely without a publication draft id', async () => {
    const { result } = renderHook(() => usePartyDraftTags(null))

    await act(async () => result.current.flush(null))

    expect(getForEntity).not.toHaveBeenCalled()
    expect(syncForEntity).not.toHaveBeenCalled()
  })

  it('exposes failed autosaves and retries only the latest tag selection', async () => {
    const failure = new Error('Offline')
    syncForEntity.mockRejectedValueOnce(failure)
    getForEntity.mockResolvedValue([{ id: 'existing-tag' }])
    const { result } = renderHook(() => usePartyDraftTags('party-draft'))
    await waitFor(() => expect(result.current.tagIds).toEqual(['existing-tag']))

    act(() => result.current.setTagIds(['latest-tag']))
    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(syncForEntity).toHaveBeenCalledTimes(1)

    await act(async () => {
      expect(await result.current.retry()).toBe(true)
    })
    expect(result.current.saveState).toBe('idle')
    expect(syncForEntity).toHaveBeenCalledTimes(2)
    expect(syncForEntity).toHaveBeenLastCalledWith(
      'party',
      'party-draft',
      ['existing-tag'],
      ['latest-tag'],
    )
  })

  it.each(['hydrate', 'read-before-write', 'sync'] as const)(
    'retains the original %s rejection across selections and draft changes until remount',
    async (stage) => {
      const failure = new Error(`${stage} unavailable`)
      if (stage === 'hydrate') getForEntity.mockRejectedValueOnce(failure)
      const initialProps: { id: string | null } = { id: 'first-party-draft' }
      const { result, rerender, unmount } = renderHook(
        ({ id }: { id: string | null }) => usePartyDraftTags(id),
        { initialProps },
      )

      if (stage !== 'hydrate') {
        await act(async () => result.current.flush(null))
        if (stage === 'read-before-write') {
          getForEntity.mockRejectedValueOnce(failure)
        } else {
          syncForEntity.mockRejectedValueOnce(failure)
        }
        act(() => {
          result.current.setTagIds(['first-selection'])
          result.current.setTagIds(['queued-selection'])
        })
      }
      await expect(result.current.flush('first-party-draft')).rejects.toBe(
        failure,
      )
      const readCount = getForEntity.mock.calls.length
      const writeCount = syncForEntity.mock.calls.length

      act(() => result.current.setTagIds(['after-failure']))
      rerender({ id: null })
      await expect(result.current.flush(null)).rejects.toBe(failure)
      rerender({ id: 'second-party-draft' })
      await expect(result.current.flush('second-party-draft')).rejects.toBe(
        failure,
      )
      expect(getForEntity).toHaveBeenCalledTimes(readCount)
      expect(syncForEntity).toHaveBeenCalledTimes(writeCount)
      expect(result.current.tagIds).toEqual(['after-failure'])

      unmount()
      const remounted = renderHook(() =>
        usePartyDraftTags('second-party-draft'),
      )
      await act(async () =>
        remounted.result.current.flush('second-party-draft'),
      )
      expect(syncForEntity).toHaveBeenLastCalledWith(
        'party',
        'second-party-draft',
        [],
        [],
      )
    },
  )

  it('propagates an in-flight hydration rejection after cancelling its draft target', async () => {
    const failure = new Error('Cancelled hydration failed')
    let rejectLoad!: (error: Error) => void
    getForEntity.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject
      }),
    )
    const { result, rerender } = renderHook(({ id }) => usePartyDraftTags(id), {
      initialProps: { id: 'old-party-draft' },
    })
    await waitFor(() => expect(getForEntity).toHaveBeenCalledTimes(1))
    act(() => result.current.setTagIds(['queued-selection']))
    rerender({ id: 'new-party-draft' })
    rejectLoad(failure)

    await expect(result.current.flush('new-party-draft')).rejects.toBe(failure)
    expect(getForEntity).toHaveBeenCalledTimes(1)
    expect(syncForEntity).not.toHaveBeenCalled()
    expect(result.current.tagIds).toEqual(['queued-selection'])
  })
})
