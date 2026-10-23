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

  it('refuses publication rather than wiping tags when hydration fails', async () => {
    service.getForEntity.mockRejectedValue(new Error('Offline'))
    const { result } = renderHook(() => useDraftTags('duplicate'))
    await expect(result.current.flush('duplicate')).rejects.toThrow('Offline')
    expect(service.syncForEntity).not.toHaveBeenCalled()
  })
})
