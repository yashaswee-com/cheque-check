'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Switch } from '@/components/ui/switch'
import { MonitoringPreferences } from '@/components/monitoring-preferences'
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/features/profile/lib/preference-options'
import { useReminderOptions } from '@/features/profile/hooks/use-reminder-options'

export default function PreferencesPage() {
  const t = useTranslations('Onboarding')
  const ts = useTranslations('Settings')
  const { profile, updateProfile, isLoading } = useProfile()

  const { REMINDERS_PER_DAY_OPTIONS, REMINDER_FREQUENCY_OPTIONS } =
    useReminderOptions()

  if (isLoading) {
    return <div className="p-4">{ts('loadingPreferences')}</div>
  }

  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('currency')}
            </Label>
            <Combobox
              options={CURRENCY_OPTIONS}
              value={profile.currency}
              testId="preferences-currency"
              onValueChange={(v) => updateProfile({ currency: v })}
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('language')}
            </Label>
            <Combobox
              options={LANGUAGE_OPTIONS}
              value={profile.language}
              testId="preferences-language"
              onValueChange={(v) => {
                updateProfile({ language: v })
                document.cookie = `NEXT_LOCALE=${v}; path=/; max-age=31536000`
                window.location.reload()
              }}
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
            {t('dateFormat')}
          </Label>
          <Combobox
            options={DATE_FORMAT_OPTIONS}
            value={profile.date_format}
            testId="preferences-date-format"
            onValueChange={(v) => updateProfile({ date_format: v })}
            className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('timeFormat')}
            </Label>
            <Combobox
              options={TIME_FORMAT_OPTIONS}
              value={profile.time_format || '12h'}
              testId="preferences-time-format"
              onValueChange={(v) => updateProfile({ time_format: v })}
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('timeZone')}
            </Label>
            <Combobox
              options={TIMEZONE_OPTIONS}
              value={profile.time_zone}
              testId="preferences-time-zone"
              onValueChange={(v) => updateProfile({ time_zone: v })}
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-border/50">
        <h3 className="text-lg font-medium">{t('notifications')}</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('dailyFrequency')}
            </Label>
            <Combobox
              options={REMINDERS_PER_DAY_OPTIONS}
              value={profile.reminders_per_day.toString()}
              onValueChange={(v) =>
                updateProfile({ reminders_per_day: parseInt(v) })
              }
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
            <p className="text-[11px] text-muted-foreground px-1">
              {t('dailyFrequencyHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('advancedWarning')}
            </Label>
            <Combobox
              options={REMINDER_FREQUENCY_OPTIONS}
              value={profile.default_reminder_days.toString()}
              onValueChange={(v) =>
                updateProfile({ default_reminder_days: parseInt(v) })
              }
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
            <p className="text-[11px] text-muted-foreground px-1">
              {t('advancedWarningHelp')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-6">
        <div className="space-y-1">
          <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {ts('reduceMotion')}
          </Label>
          <p className="text-[11px] text-muted-foreground">
            {ts('reduceMotionDesc')}
          </p>
        </div>
        <Switch
          checked={profile.reduce_motion}
          onCheckedChange={(checked) =>
            updateProfile({ reduce_motion: checked })
          }
          aria-label={ts('reduceMotion')}
        />
      </div>

      <div className="border-t border-border/50 pt-6">
        <MonitoringPreferences />
      </div>
    </div>
  )
}
