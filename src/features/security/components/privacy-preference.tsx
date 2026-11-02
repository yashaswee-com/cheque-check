'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'
import { InfoPopover } from '@/components/ui/info-popover'
export function PrivacyPreference() {
  const { profile, updateProfile } = useProfile()
  const t = useTranslations('Security')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Label htmlFor="privacy-cover">{t('privacyTitle')}</Label>
          <InfoPopover title={t('privacyTitle')}>
            {t('privacyLimit')}
          </InfoPopover>
        </div>
        <Switch
          id="privacy-cover"
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
        />
      </div>
      {error && <p role="alert">{t('saveError')}</p>}
    </section>
  )
}
