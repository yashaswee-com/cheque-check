'use client'

import { useState } from 'react'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'
import type { DateRange } from 'react-day-picker'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Calendar03Icon as CalendarIcon } from '@hugeicons/core-free-icons'
import {
  PillScroller,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
} from '@/features/cheques/lib/date-range'

interface StatsDateFilterProps {
  preset: DateRangePreset
  onPresetChange: (preset: DateRangePreset) => void
  customRange: DateRange | undefined
  onCustomRangeChange: (range: DateRange | undefined) => void
}

export function StatsDateFilter({
  preset,
  onPresetChange,
  customRange,
  onCustomRangeChange,
}: StatsDateFilterProps) {
  const t = useTranslations('Dashboard')
  const display = useDisplayFormat()
  const [calendarOpen, setCalendarOpen] = useState(false)

  const items = DATE_RANGE_PRESETS.map((value) => ({
    value,
    label: t(`dateRange.${value}`),
  }))

  const customLabel = customRange?.from
    ? customRange.to && customRange.to !== customRange.from
      ? `${display.calendarDate(customRange.from)} – ${display.calendarDate(customRange.to)}`
      : display.calendarDate(customRange.from)
    : t('dateRange.pickDates')

  return (
    <PillScroller aria-label={t('dateRange.label')}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={preset === item.value}
          className={filterPillClassName(
            preset === item.value,
            'text-xs font-medium',
          )}
          onClick={() => {
            onPresetChange(item.value)
            if (item.value === 'custom') setCalendarOpen(true)
          }}
        >
          {item.label}
        </button>
      ))}
      {preset === 'custom' && (
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger
            className={filterPillClassName(true, 'text-xs font-medium')}
          >
            <HugeiconsIcon icon={CalendarIcon} className="h-3.5 w-3.5" />
            {customLabel}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={onCustomRangeChange}
              weekStartsOn={1}
              defaultMonth={customRange?.from}
            />
          </PopoverContent>
        </Popover>
      )}
    </PillScroller>
  )
}
