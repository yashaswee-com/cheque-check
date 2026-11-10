import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftTags } from './use-draft-tags'

const service = vi.hoisted(() => ({
  getForEntity: vi.fn(),
  syncForEntity: vi.fn(),
}))
vi.mock('@/features/tags/services/tag.service', () => ({ tagService: service }))

beforeEach(() => {
  vi.resetAllMocks()
  service.getForEntity.mockResolvedValue([
    { id: 'copied-a' },
    { id: 'copied-b' },
  ])
  service.syncForEntity.mockResolvedValue(undefined)
})

describe('draft tags', () => {
  it('hydrates copied links after reload and saves removals on the duplicate only', async () => {
    const { result } = renderHook(() => useDraftTags('duplicate'))
    await waitFor(() =>
      expect(result.current.tagIds).toEqual(['copied-a', 'copied-b']),
    )
    act(() => result.current.setTagIds(['copied-b']))
    await act(() => result.current.flush('duplicate'))
    expect(service.syncForEntity).toHaveBeenCalledWith(
      'cheque',
      'duplicate',
      ['copied-a', 'copied-b'],
      ['copied-b'],
    )
    expect(
      service.syncForEntity.mock.calls.every((call) => call[1] === 'duplicate'),
    ).toBe(true)
  })

  it('preserves selection made before autosave creates the first draft', async () => {
    const { result, rerender } = renderHook(({ id }) => useDraftTags(id), {
      initialProps: { id: null as string | null },
    })
    act(() => result.current.setTagIds(['new-tag']))
    rerender({ id: 'new-draft' })
    await act(() => result.current.flush('new-draft'))
    expect(result.current.tagIds).toEqual(['new-tag'])
    expect(service.syncForEntity).toHaveBeenLastCalledWith(
      'cheque',
      'new-draft',
      ['copied-a', 'copied-b'],
      ['new-tag'],
    )
  })

  it('synchronizes the currently linked tags before applying a selection', async () => {
    service.getForEntity.mockResolvedValue([{ id: 'existing-tag' }])
    const { result } = renderHook(() =>
      useDraftTags('draft-with-existing-tags'),
    )
    await waitFor(() => expect(result.current.tagIds).toEqual(['existing-tag']))
    act(() => result.current.setTagIds(['next-tag']))
    await act(async () => result.current.flush('draft-with-existing-tags'))

    expect(service.syncForEntity).toHaveBeenCalledWith(
      'cheque',
      'draft-with-existing-tags',
      ['existing-tag'],
      ['next-tag'],
    )
  })

  it('refuses publication rather than wiping tags when hydration fails', async () => {
    service.getForEntity.mockRejectedValue(new Error('Offline'))
    const { result } = renderHook(() => useDraftTags('duplicate'))
    await expect(result.current.flush('duplicate')).rejects.toThrow('Offline')
    act(() => result.current.setTagIds(['new-tag']))
    await expect(result.current.flush('duplicate')).rejects.toThrow('Offline')
    expect(service.syncForEntity).not.toHaveBeenCalled()
  })

  it('does not hydrate stale links after the draft target changes during loading', async () => {
    let finishLoad!: (tags: { id: string }[]) => void
    service.getForEntity.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLoad = resolve
      }),
    )
    const { result, rerender } = renderHook(({ id }) => useDraftTags(id), {
      initialProps: { id: 'old-draft' },
    })

    rerender({ id: 'new-draft' })
    await act(async () => {
      finishLoad([{ id: 'stale-tag' }])
    })
    await waitFor(() =>
      expect(result.current.tagIds).toEqual(['copied-a', 'copied-b']),
    )
    expect(service.getForEntity).toHaveBeenNthCalledWith(
      1,
      'cheque',
      'old-draft',
    )
    expect(service.getForEntity).toHaveBeenNthCalledWith(
      2,
      'cheque',
      'new-draft',
    )
  })

  it('flushes safely when no draft id exists', async () => {
    const { result } = renderHook(() => useDraftTags(null))
    await act(async () => result.current.flush(null))

    expect(service.getForEntity).not.toHaveBeenCalled()
    expect(service.syncForEntity).not.toHaveBeenCalled()
  })

  it('exposes failed autosaves and retries only the latest tag selection', async () => {
    const failure = new Error('Offline')
    service.syncForEntity.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useDraftTags('draft'))
    await waitFor(() =>
      expect(result.current.tagIds).toEqual(['copied-a', 'copied-b']),
    )

    act(() => result.current.setTagIds(['latest-tag']))
    await waitFor(() => expect(result.current.saveState).toBe('error'))
    expect(service.syncForEntity).toHaveBeenCalledTimes(1)

    await act(async () => {
      expect(await result.current.retry()).toBe(true)
    })
    expect(result.current.saveState).toBe('idle')
    expect(service.syncForEntity).toHaveBeenCalledTimes(2)
    expect(service.syncForEntity).toHaveBeenLastCalledWith(
      'cheque',
      'draft',
      ['copied-a', 'copied-b'],
      ['latest-tag'],
    )
  })

  it('retries failed hydration without overwriting existing tags', async () => {
    service.getForEntity.mockRejectedValueOnce(new Error('Offline'))
    const { result } = renderHook(() => useDraftTags('draft'))
    await waitFor(() => expect(result.current.saveState).toBe('error'))

    await act(async () => {
      expect(await result.current.retry()).toBe(true)
    })
    expect(result.current.tagIds).toEqual(['copied-a', 'copied-b'])
    expect(service.syncForEntity).not.toHaveBeenCalled()
    expect(result.current.saveState).toBe('idle')
  })

  it.each(['hydrate', 'read-before-write', 'sync'] as const)(
    'keeps the original %s rejection across queued writes and target changes until remount',
    async (stage) => {
      const failure = new Error(`${stage} unavailable`)
      if (stage === 'hydrate') {
        service.getForEntity.mockRejectedValueOnce(failure)
      }
      const initialProps: { id: string | null } = { id: 'first-draft' }
      const { result, rerender, unmount } = renderHook(
        ({ id }: { id: string | null }) => useDraftTags(id),
        { initialProps },
      )

      if (stage !== 'hydrate') {
        await waitFor(() =>
          expect(result.current.tagIds).toEqual(['copied-a', 'copied-b']),
        )
        if (stage === 'read-before-write') {
          service.getForEntity.mockRejectedValueOnce(failure)
        } else {
          service.syncForEntity.mockRejectedValueOnce(failure)
        }
        act(() => {
          result.current.setTagIds(['first-selection'])
          result.current.setTagIds(['queued-selection'])
        })
      }

      await expect(result.current.flush('first-draft')).rejects.toBe(failure)
      const readCount = service.getForEntity.mock.calls.length
      const writeCount = service.syncForEntity.mock.calls.length

      act(() => result.current.setTagIds(['after-failure']))
      rerender({ id: null })
      await expect(result.current.flush(null)).rejects.toBe(failure)
      rerender({ id: 'second-draft' })
      await expect(result.current.flush('second-draft')).rejects.toBe(failure)
      expect(service.getForEntity).toHaveBeenCalledTimes(readCount)
      expect(service.syncForEntity).toHaveBeenCalledTimes(writeCount)
      expect(result.current.tagIds).toEqual(['after-failure'])

      unmount()
      const remounted = renderHook(() => useDraftTags('second-draft'))
      await waitFor(() =>
        expect(remounted.result.current.tagIds).toEqual([
          'copied-a',
          'copied-b',
        ]),
      )
      await act(async () => remounted.result.current.flush('second-draft'))
      expect(service.syncForEntity).toHaveBeenLastCalledWith(
        'cheque',
        'second-draft',
        ['copied-a', 'copied-b'],
        ['copied-a', 'copied-b'],
      )
    },
  )

  it('propagates an in-flight hydration failure even after that target is cancelled', async () => {
    const failure = new Error('Cancelled hydration failed')
    let rejectLoad!: (error: Error) => void
    service.getForEntity.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectLoad = reject
      }),
    )
    const { result, rerender } = renderHook(({ id }) => useDraftTags(id), {
      initialProps: { id: 'old-draft' },
    })
    await waitFor(() => expect(service.getForEntity).toHaveBeenCalledTimes(1))
    act(() => result.current.setTagIds(['queued-selection']))
    rerender({ id: 'new-draft' })
    rejectLoad(failure)

    await expect(result.current.flush('new-draft')).rejects.toBe(failure)
    expect(service.getForEntity).toHaveBeenCalledTimes(1)
    expect(service.syncForEntity).not.toHaveBeenCalled()
    expect(result.current.tagIds).toEqual(['queued-selection'])
  })
})
