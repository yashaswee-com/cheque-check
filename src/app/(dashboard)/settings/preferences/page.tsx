'use client'

import * as React from 'react'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { SettingSwitchRow } from '@/components/ui/setting-switch-row'
import { MonitoringPreferences } from '@/components/monitoring-preferences'
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  TIMEZONE_OPTIONS,
} from '@/features/profile/lib/preference-options'
import { useReminderOptions } from '@/features/profile/hooks/use-reminder-options'
import { toast } from '@/components/ui/toast'
import type { Profile } from '@/types'
import { useTimeFormatOptions } from '@/features/profile/hooks/use-time-format-options'
import { ReminderTimesEditor } from '@/features/profile/components/reminder-times-editor'
import { DEFAULT_REMINDER_TIMES } from '@/features/profile/lib/reminder-times'
import { AppearancePreference } from '@/features/profile/components/appearance-preference'
import { PrivacyPreference } from '@/features/security/components/privacy-preference'
import { InfoPopover } from '@/components/ui/info-popover'

export default function PreferencesPage() {
  const t = useTranslations('Onboarding')
  const ts = useTranslations('Settings')
  const tc = useTranslations('Common')
  const { profile, updateProfile, isLoading } = useProfile()
  const timeFormatOptions = useTimeFormatOptions()
  const savePreference = async (changes: Partial<Profile>) => {
    try {
      await updateProfile(changes)
    } catch (error) {
      toast.add({
        title: tc('error'),
        description: error instanceof Error ? error.message : tc('error'),
        type: 'error',
      })
    }
  }

  const { REMINDERS_PER_DAY_OPTIONS, REMINDER_FREQUENCY_OPTIONS } =
    useReminderOptions()

  if (isLoading) {
    return <div className="p-4">{ts('loadingPreferences')}</div>
  }

  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <AppearancePreference />
      <PrivacyPreference />
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
              onValueChange={(v) => savePreference({ currency: v })}
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
              onValueChange={(v) => savePreference({ language: v })}
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
            onValueChange={(v) => savePreference({ date_format: v })}
            className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
              {t('timeFormat')}
            </Label>
            <Combobox
              options={timeFormatOptions}
              value={profile.time_format || '12h'}
              testId="preferences-time-format"
              onValueChange={(v) => savePreference({ time_format: v })}
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
              onValueChange={(v) => savePreference({ time_zone: v })}
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>
        </div>
      </div>

      <div className="space-y-6 pt-6 border-t border-border/50">
        <h3 className="text-lg font-medium">{t('notifications')}</h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                {t('dailyFrequency')}
              </Label>
              <InfoPopover title={t('dailyFrequency')}>
                {t('dailyFrequencyHelp')}
              </InfoPopover>
            </div>
            <Combobox
              options={REMINDERS_PER_DAY_OPTIONS}
              value={profile.reminders_per_day.toString()}
              onValueChange={(v) =>
                savePreference({ reminders_per_day: parseInt(v) })
              }
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1">
              <Label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                {t('advancedWarning')}
              </Label>
              <InfoPopover title={t('advancedWarning')}>
                {t('advancedWarningHelp')}
              </InfoPopover>
            </div>
            <Combobox
              options={REMINDER_FREQUENCY_OPTIONS}
              value={profile.default_reminder_days.toString()}
              onValueChange={(v) =>
                savePreference({ default_reminder_days: parseInt(v) })
              }
              className="h-14 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg"
            />
          </div>

          <ReminderTimesEditor
            times={
              profile.reminder_times ??
              DEFAULT_REMINDER_TIMES[profile.reminders_per_day] ??
              DEFAULT_REMINDER_TIMES[1]
            }
            timeFormat={profile.time_format}
            onChange={(reminder_times) => savePreference({ reminder_times })}
          />
        </div>
      </div>

      <div className="border-t border-border/50 pt-6">
        <SettingSwitchRow
          id="reduce-motion"
          label={ts('reduceMotion')}
          description={ts('reduceMotionDesc')}
          checked={profile.reduce_motion}
          onCheckedChange={(checked) =>
            savePreference({ reduce_motion: checked })
          }
        />
      </div>

      <div className="border-t border-border/50 pt-6">
        <MonitoringPreferences />
      </div>
    </div>
  )
}
