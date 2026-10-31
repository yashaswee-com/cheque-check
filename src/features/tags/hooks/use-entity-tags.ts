'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tag, TagEntityType } from '@/types'
import { tagService } from '@/features/tags/services/tag.service'
import { queryKeys } from '@/lib/query-keys'
import { logger } from '@/lib/logger'

export function useEntityTags(
  entityType: TagEntityType,
  entityId: string | undefined,
) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.entityTags.forEntity(entityType, entityId)
  const query = useQuery<Tag[]>({
    queryKey,
    queryFn: () => tagService.getForEntity(entityType, entityId!),
    enabled: !!entityId,
    staleTime: 0,
  })
  const tags = query.data ?? []

  const saveTags = async (tagIds: readonly string[]) => {
    if (!entityId) return
    await tagService.syncForEntity(
      entityType,
      entityId,
      tags.map((tag) => tag.id),
      tagIds,
    )
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.entityTagMap.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.allDetail() }),
    ])
  }

  return {
    tags,
    tagIds: tags.map((tag) => tag.id),
    isLoading: query.isLoading,
    saveTags,
  }
}

/** Local tag selection for edit forms; `commit` persists it only if changed. */
export function useEntityTagsDraft(
  entityType: TagEntityType,
  entityId: string | undefined,
) {
  const {
    tagIds: savedIds,
    isLoading,
    saveTags,
  } = useEntityTags(entityType, entityId)
  const [draft, setDraft] = useState<string[] | null>(null)

  return {
    tagIds: draft ?? savedIds,
    setTagIds: setDraft,
    isLoading,
    commit: async () => {
      if (draft) await saveTags(draft)
    },
  }
}

/** Tags for every entity of a type, keyed by entity id; `null` spans all businesses. */
export function useEntityTagMap(
  businessId: string | null | undefined,
  entityType: TagEntityType,
  entityIds?: readonly string[],
) {
  const query = useQuery<Record<string, Tag[]>>({
    queryKey: queryKeys.entityTagMap.forBusiness(
      businessId,
      entityType,
      entityIds,
    ),
    queryFn: () =>
      entityIds
        ? tagService.getTagMap(businessId!, entityType, entityIds)
        : tagService.getTagMap(businessId!, entityType),
    enabled: businessId !== undefined && (!entityIds || entityIds.length > 0),
    staleTime: 0,
  })
  useEffect(() => {
    if (query.error)
      logger.error('Entity tags could not be loaded', query.error)
  }, [query.error])
  return query.data ?? {}
}
