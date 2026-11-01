'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { useProfile } from '../hooks/use-profile'
import { appearanceSchema } from '@/validators/profile'
import { persistAppearance } from '../lib/appearance'
import { logger } from '@/lib/logger'
export function AppearancePreference() {
  const { profile, updateProfile } = useProfile()
  const t = useTranslations('Appearance')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  return (
    <section className="space-y-2">
      <Label>{t('title')}</Label>
      <Combobox
        value={profile?.appearance ?? 'system'}
        disabled={busy}
        testId="preferences-appearance"
        options={['light', 'dark', 'system'].map((value) => ({
          value,
          label: t(value),
        }))}
        onValueChange={async (value) => {
          const appearance = appearanceSchema.parse(value)
          setBusy(true)
          setError(false)
          persistAppearance(appearance)
          try {
            await updateProfile({ appearance })
          } catch (error) {
            logger.error('Appearance could not be saved', error)
            persistAppearance(profile?.appearance ?? 'system')
            setError(true)
          } finally {
            setBusy(false)
          }
        }}
      />
      {error && <p role="alert">{t('error')}</p>}
    </section>
  )
}
