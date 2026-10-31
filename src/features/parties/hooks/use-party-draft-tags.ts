import { useCallback, useEffect, useRef, useState } from 'react'
import { tagService } from '@/features/tags/services/tag.service'
import type { Tag } from '@/types'

export function usePartyDraftTags(draftId: string | null) {
  const [tagIds, setSelected] = useState<string[]>([])
  const selected = useRef<string[]>([])
  const dirty = useRef(false)
  const target = useRef(draftId)
  const pending = useRef<Promise<void>>(Promise.resolve())

  const persist = useCallback((id: string, ids: string[]) => {
    const write = pending.current.then(async () => {
      const current = await tagService.getForEntity('party', id)
      await tagService.syncForEntity(
        'party',
        id,
        current.map((tag: Tag) => tag.id),
        ids,
      )
    })
    pending.current = write
    void write.catch(() => undefined)
    return write
  }, [])

  useEffect(() => {
    target.current = draftId
    if (!draftId) return
    let cancelled = false
    const load = pending.current.then(async () => {
      const tags = await tagService.getForEntity('party', draftId)
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
