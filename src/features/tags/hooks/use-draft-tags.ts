import { useCallback, useEffect, useRef, useState } from 'react'
import { tagService } from '@/features/tags/services/tag.service'
import { logger } from '@/lib/logger'
import type { Tag, TagEntityType } from '@/types'

/** Draft and published entity links share an identity, so publication never copies links. */
export function useDraftEntityTags(
  entityType: Extract<TagEntityType, 'cheque' | 'party'>,
  draftId: string | null,
) {
  const [tagIds, setSelected] = useState<string[]>([])
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'error'>(
    'idle',
  )
  const selected = useRef<string[]>([])
  const dirty = useRef(false)
  const target = useRef(draftId)
  const pending = useRef<Promise<void>>(Promise.resolve())
  const pendingCount = useRef(0)
  const hydrationFailed = useRef(false)

  const persist = useCallback(
    (id: string, ids: string[]) => {
      pendingCount.current += 1
      setSaveState('pending')
      const write = pending.current.then(async () => {
        const current = await tagService.getForEntity(entityType, id)
        await tagService.syncForEntity(
          entityType,
          id,
          current.map((tag: Tag) => tag.id),
          ids,
        )
      })
      pending.current = write
      void write.then(
        () => {
          pendingCount.current -= 1
          if (!pendingCount.current) setSaveState('idle')
        },
        (error: unknown) => {
          logger.error('Draft entity tags could not be saved', error)
          pendingCount.current -= 1
          if (!pendingCount.current) setSaveState('error')
        },
      )
      void write.catch(() => undefined)
      return write
    },
    [entityType],
  )

  const retry = useCallback(
    async (entityId: string | null = target.current) => {
      if (!entityId) return true
      if (hydrationFailed.current && !dirty.current) {
        setSaveState('pending')
        try {
          const tags = await tagService.getForEntity(entityType, entityId)
          selected.current = tags.map((tag: Tag) => tag.id)
          setSelected(selected.current)
          hydrationFailed.current = false
          pending.current = Promise.resolve()
          setSaveState('idle')
          return true
        } catch (error) {
          logger.error('Draft entity tags could not be loaded', error)
          setSaveState('error')
          return false
        }
      }

      pending.current = pending.current.catch(() => undefined)
      try {
        await persist(entityId, [...selected.current])
        return true
      } catch {
        return false
      }
    },
    [entityType, persist],
  )

  useEffect(() => {
    target.current = draftId
    if (!draftId) return
    let cancelled = false
    const load = pending.current.then(async () => {
      try {
        const tags = await tagService.getForEntity(entityType, draftId)
        hydrationFailed.current = false
        if (!cancelled && !dirty.current) {
          selected.current = tags.map((tag: Tag) => tag.id)
          setSelected(selected.current)
        }
      } catch (error) {
        hydrationFailed.current = true
        if (!cancelled) {
          logger.error('Draft entity tags could not be loaded', error)
          setSaveState('error')
        }
        throw error
      }
    })
    pending.current = load
    void load.catch(() => undefined)
    if (dirty.current) void persist(draftId, [...selected.current])
    return () => {
      cancelled = true
    }
  }, [draftId, entityType, persist])

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
      if (id) target.current = id
      await pending.current
      if (id) {
        await persist(id, [...selected.current])
      }
    },
    [persist],
  )

  return { tagIds, setTagIds, flush, saveState, retry }
}

export function useDraftTags(draftId: string | null) {
  return useDraftEntityTags('cheque', draftId)
}
