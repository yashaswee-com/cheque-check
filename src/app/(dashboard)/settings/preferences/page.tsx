'use client'

import * as React from 'react'
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
import { toast } from '@/components/ui/toast'
import type { Profile } from '@/types'
import { useTimeFormatOptions } from '@/features/profile/hooks/use-time-format-options'
import { AppearancePreference } from '@/features/profile/components/appearance-preference'
import { PreferenceField } from '@/features/profile/components/preference-field'
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

  if (isLoading) {
    return <div className="p-4">{ts('loadingPreferences')}</div>
  }

  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-8 pb-20">
      <AppearancePreference />
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        data-testid="preferences-fields"
      >
        <PreferenceField
          id="preferences-currency"
          label={t('currency')}
          options={CURRENCY_OPTIONS}
          value={profile.currency}
          onSave={(currency) => updateProfile({ currency })}
        />
        <PreferenceField
          id="preferences-language"
          label={t('language')}
          options={LANGUAGE_OPTIONS}
          value={profile.language}
          onSave={(language) => updateProfile({ language })}
        />
        <PreferenceField
          id="preferences-date-format"
          label={t('dateFormat')}
          options={DATE_FORMAT_OPTIONS}
          value={profile.date_format}
          onSave={(date_format) => updateProfile({ date_format })}
        />
        <PreferenceField
          id="preferences-time-format"
          label={t('timeFormat')}
          options={timeFormatOptions}
          value={profile.time_format}
          onSave={(time_format) => updateProfile({ time_format })}
        />
        <PreferenceField
          id="preferences-time-zone"
          label={t('timeZone')}
          options={TIMEZONE_OPTIONS}
          value={profile.time_zone}
          onSave={(time_zone) => updateProfile({ time_zone })}
        />
      </div>

      <div className="border-t border-border/50 pt-6">
        <SettingSwitchRow
          id="reduce-motion"
          label={ts('reduceMotion')}
          info={
            <InfoPopover title={ts('reduceMotion')}>
              {ts('reduceMotionDesc')}
            </InfoPopover>
          }
          checked={profile.reduce_motion}
          onCheckedChange={(checked) =>
            savePreference({ reduce_motion: checked })
          }
        />
      </div>

      <div className="border-t border-border/50 pt-6">
        <MonitoringPreferences />
      </div>

      <div className="border-t border-border/50 pt-6">
        <PrivacyPreference />
      </div>
    </div>
  )
}
