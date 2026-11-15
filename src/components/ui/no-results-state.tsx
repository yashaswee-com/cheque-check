'use client'

import { Search01Icon as Search } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import {
  entityKey,
  type CountedEntity,
} from '@/components/ui/filter-result-count'

export interface NoResultsStateProps {
  entity: CountedEntity
  /** Records searched before filters removed them all; omit when unknown (server paging). */
  total?: number
  search?: string
  /** Count of non-default filters (status, type, etc.) excluding the search. */
  filterCount?: number
  /** Where the search ran, e.g. the active business name. */
  scope?: string
  onClear?: () => void
  className?: string
}

/** Explains what was searched, why nothing matched, and how to recover. */
export function NoResultsState({
  entity,
  total,
  search,
  filterCount = 0,
  scope,
  onClear,
  className,
}: NoResultsStateProps) {
  const t = useTranslations('Common')
  const term = search?.trim()
  const plural = t(entityKey(entity), { count: 2 })
  const searchedEntity = t(entityKey(entity), { count: total ?? 2 })
  return (
    <EmptyState
      icon={Search}
      data-testid="no-results-state"
      className={className}
      title={
        term
          ? t('noEntityMatchedSearch', { entity: plural, search: term })
          : t('noEntityMatchedFilters', { entity: plural })
      }
      description={
        total === undefined
          ? scope
            ? t('noResultsSearchedScopeAny', { entity: plural, scope })
            : t('noResultsSearchedAllAny', { entity: plural })
          : scope
            ? t('noResultsSearchedScope', {
                total,
                entity: searchedEntity,
                scope,
              })
            : t('noResultsSearchedAll', { total, entity: searchedEntity })
      }
      detail={
        <>
          {filterCount > 0 && (
            <p>{t('noResultsFiltersApplied', { count: filterCount })}</p>
          )}
          <p>
            {term
              ? t('noResultsNextSearch')
              : t('noResultsNextFilters', { entity: plural })}
          </p>
        </>
      }
      action={
        onClear
          ? { label: t('clearSearchAndFilters'), onClick: onClear }
          : undefined
      }
    />
  )
}
