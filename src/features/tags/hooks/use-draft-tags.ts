import { useCallback, useEffect, useRef, useState } from 'react'
import { tagService } from '@/features/tags/services/tag.service'
import type { Tag } from '@/types'

/** Draft and published cheque links share an identity, so publication never copies links. */
export function useDraftTags(draftId: string | null) {
  const [tagIds, setSelected] = useState<string[]>([])
  const selected = useRef<string[]>([])
  const dirty = useRef(false)
  const target = useRef(draftId)
  const pending = useRef<Promise<void>>(Promise.resolve())

  const persist = useCallback((id: string, ids: string[]) => {
    const write = pending.current.then(async () => {
      const current = await tagService.getForEntity('cheque', id)
      await tagService.syncForEntity(
        'cheque',
        id,
        current.map((tag: Tag) => tag.id),
        ids,
      )
    })
    pending.current = write
    // Keep rejected writes observable to flush(), without an unhandled rejection.
    void write.catch(() => undefined)
    return write
  }, [])

  useEffect(() => {
    target.current = draftId
    if (!draftId) return
    let cancelled = false
    const load = pending.current.then(async () => {
      const tags = await tagService.getForEntity('cheque', draftId)
      if (!cancelled && !dirty.current) {
        selected.current = tags.map((tag: Tag) => tag.id)
        setSelected(selected.current)
      }
    })
    pending.current = load
    void load.catch(() => undefined)
    if (dirty.current) void persist(draftId, [...selected.current])
    return () => {
      cancelled = true
    }
  }, [draftId, persist])

  const setTagIds = useCallback(
    (ids: string[]) => {
      dirty.current = true
      selected.current = ids
      setSelected(ids)
      if (target.current) void persist(target.current, [...ids])
    },
    [persist],
  )

  const flush = useCallback(
    async (id: string | null) => {
      await pending.current
      if (id) await persist(id, [...selected.current])
    },
    [persist],
  )

  return { tagIds, setTagIds, flush }
}
