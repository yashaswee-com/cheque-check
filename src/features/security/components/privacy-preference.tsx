'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { SettingSwitchRow } from '@/components/ui/setting-switch-row'
import { logger } from '@/lib/logger'
import { InfoPopover } from '@/components/ui/info-popover'
export function PrivacyPreference() {
  const { profile, updateProfile } = useProfile()
  const t = useTranslations('Security')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <SettingSwitchRow
      id="privacy-cover"
      label={t('privacyTitle')}
      info={
        <InfoPopover title={t('privacyTitle')}>{t('privacyLimit')}</InfoPopover>
      }
      checked={profile?.privacy_cover !== false}
      disabled={busy}
      onCheckedChange={async (privacy_cover) => {
        setBusy(true)
        setError(false)
        try {
          await updateProfile({ privacy_cover })
        } catch (error) {
          logger.error('Privacy preference could not be saved', error)
          setError(true)
        } finally {
          setBusy(false)
        }
      }}
    >
      {error && <p role="alert">{t('saveError')}</p>}
    </SettingSwitchRow>
  )
}
