'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export type CountedEntity =
  | 'cheque'
  | 'business'
  | 'party'
  | 'account'
  | 'tag'
  | 'notification'
  | 'draft'
  | 'transaction'
  | 'exportJob'
  | 'announcement'
  | 'record'

export function entityKey(entity: CountedEntity) {
  return `entity${entity[0].toUpperCase()}${entity.slice(1)}` as const
}

interface FilterResultCountProps {
  count: number
  total?: number
  entity: CountedEntity
  className?: string
}

/** Live "X <entities> selected" footer for sort & filter sheets. */
export function FilterResultCount({
  count,
  total,
  entity,
  className,
}: FilterResultCountProps) {
  const t = useTranslations('Common')
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="filter-result-count"
      className={cn(
        'sticky bottom-0 -mx-1 mt-2 flex items-baseline justify-center gap-1.5 border-t bg-popover/95 px-1 py-3 text-sm backdrop-blur',
        className,
      )}
    >
      <span className="font-semibold text-foreground">
        {t('filterResultCount', {
          count,
          entity: t(entityKey(entity), { count }),
        })}
      </span>
      {total !== undefined && (
        <span className="text-xs text-muted-foreground">
          {t('filterResultTotal', { total })}
        </span>
      )}
    </div>
  )
}
