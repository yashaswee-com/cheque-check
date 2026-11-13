'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  NoteEditIcon as DraftIcon,
  ArrowRight01Icon as ChevronRight,
} from '@hugeicons/core-free-icons'
import { useBusiness } from '@/features/businesses/hooks/use-business'
import { DRAFT_LIST_PATHS, type DraftEntity } from '../lib/draft-fields'
import { DRAFTS_PATH } from '../lib/drafts-params'
import { useDraftCounts } from '../hooks/use-drafts'

export function DraftsLink({ entity }: { entity: DraftEntity }) {
  const t = useTranslations('Drafts')
  const { activeBusiness } = useBusiness()
  const count = useDraftCounts(activeBusiness?.id).data?.[entity] ?? 0

  if (!count) return null

  return (
    <Link
      href={DRAFT_LIST_PATHS[entity]}
      className="flex items-center justify-between rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm font-normal text-primary"
    >
      <span className="flex items-center gap-2">
        <HugeiconsIcon icon={DraftIcon} className="h-4 w-4" />
        {t('draftsCount', { count })}
      </span>
      <HugeiconsIcon icon={ChevronRight} className="h-4 w-4" />
    </Link>
  )
}

export function DraftsSummaryCard() {
  const t = useTranslations('Drafts')
  const { activeBusiness } = useBusiness()
  const counts = useDraftCounts(activeBusiness?.id).data
  const total = counts ? counts.cheque + counts.party + counts.account : 0

  if (!counts || !total) return null

  const breakdown = [
    { label: t('cheques'), count: counts.cheque },
    { label: t('parties'), count: counts.party },
    { label: t('accounts'), count: counts.account },
  ]
    .filter((row) => row.count > 0)
    .map((row) => `${row.count} ${row.label}`)
    .join(' · ')

  return (
    <Link
      href={DRAFTS_PATH}
      className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3"
    >
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon
          icon={DraftIcon}
          className="h-4 w-4 shrink-0 text-primary"
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-normal text-primary">
            {t('pendingSummary', { count: total })}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {breakdown}
          </p>
        </div>
      </div>
      <HugeiconsIcon
        icon={ChevronRight}
        className="h-4 w-4 shrink-0 text-primary/50"
      />
    </Link>
  )
}
