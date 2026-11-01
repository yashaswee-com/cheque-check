'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { logger } from '@/lib/logger'
export function PrivacyPreference() {
  const { profile, updateProfile } = useProfile()
  const t = useTranslations('Security')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="privacy-cover">{t('privacyTitle')}</Label>
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
      <p className="text-sm text-muted-foreground">{t('privacyLimit')}</p>
      {error && <p role="alert">{t('saveError')}</p>}
    </section>
  )
}
