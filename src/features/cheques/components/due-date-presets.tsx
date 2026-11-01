'use client'

import { useTranslations } from 'next-intl'
import {
  PillScroller,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { DUE_DATE_PRESETS, dueDateForPreset } from '../lib/due-date-presets'

export function DueDatePresets({
  value,
  onSelect,
}: {
  value: string
  onSelect: (day: string) => void
}) {
  const t = useTranslations('Cheques')
  const { profile } = useProfile()
  return (
    <PillScroller aria-label={t('dueDateShortcuts')}>
      {DUE_DATE_PRESETS.map((preset) => (
        <button
          type="button"
          key={preset}
          className={filterPillClassName(
            value === dueDateForPreset(preset, new Date(), profile?.time_zone),
            'px-3 py-2 text-xs',
          )}
          aria-pressed={
            value === dueDateForPreset(preset, new Date(), profile?.time_zone)
          }
          onClick={() =>
            onSelect(dueDateForPreset(preset, new Date(), profile?.time_zone))
          }
        >
          {preset === 'monthEnd'
            ? t('endOfMonth')
            : preset === 0
              ? t('dueToday')
              : t('dueInDays', { days: preset })}
        </button>
      ))}
    </PillScroller>
  )
}
