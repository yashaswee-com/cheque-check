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
    const { result } = renderHook(() => usePartyDraftTags('party-draft'))
    await waitFor(() => expect(getForEntity).toHaveBeenCalled())
    act(() => result.current.setTagIds(['tag-1', 'tag-2']))
    await act(async () => result.current.flush('party-draft'))
    expect(syncForEntity).toHaveBeenCalledWith(
      'party',
      'party-draft',
      [],
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
})
