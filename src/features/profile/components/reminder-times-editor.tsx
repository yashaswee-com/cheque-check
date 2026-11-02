'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { InfoPopover } from '@/components/ui/info-popover'
import {
  formatReminderTime,
  normalizeReminderTimes,
  REMINDER_TIME_OPTIONS,
  replaceReminderTime,
  toReminderTime,
} from '@/features/profile/lib/reminder-times'

interface ReminderTimesEditorProps {
  times: readonly string[]
  timeFormat: string | null | undefined
  onChange: (times: string[]) => void
  disabled?: boolean
}

/** One picker per daily reminder; a time used by another reminder is not offered twice. */
export function ReminderTimesEditor({
  times,
  timeFormat,
  onChange,
  disabled,
}: ReminderTimesEditorProps) {
  const ts = useTranslations('Settings')
  const current = normalizeReminderTimes(times)

  return (
    <div className="space-y-3" data-testid="reminder-times-editor">
      <div className="flex items-center gap-1">
        <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
          {ts('reminderTimes')}
        </Label>
        <InfoPopover title={ts('reminderTimes')}>
          {ts('reminderTimesHelp')}
        </InfoPopover>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {current.map((time, index) => {
          const taken = new Set(current.filter((_, other) => other !== index))
          const options = REMINDER_TIME_OPTIONS.filter(
            (option) => !taken.has(option),
          ).map((option) => ({
            value: option,
            label: formatReminderTime(option, timeFormat),
          }))
          return (
            <div key={`${index}-${time}`} className="space-y-1">
              <Label
                htmlFor={`reminder-time-${index + 1}`}
                className="text-[11px] text-muted-foreground ml-1"
              >
                {ts('reminderTimeLabel', { number: index + 1 })}
              </Label>
              <Combobox
                id={`reminder-time-${index + 1}`}
                options={options}
                allowDeselect={false}
                disabled={disabled}
                value={toReminderTime(time)}
                testId={`reminder-time-${index + 1}`}
                onValueChange={(value) => {
                  if (!disabled && value && value !== time)
                    onChange(replaceReminderTime(current, index, value))
                }}
                className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
