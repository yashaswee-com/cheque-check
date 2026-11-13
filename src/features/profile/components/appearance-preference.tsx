'use client'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { useProfile } from '../hooks/use-profile'
import { appearanceSchema } from '@/validators/profile'
import { persistAppearance } from '../lib/appearance'
import { logger } from '@/lib/logger'
import { InfoPopover } from '@/components/ui/info-popover'
import type { Appearance } from '../lib/appearance'
export function AppearancePreference() {
  const { profile, updateProfile } = useProfile()
  const t = useTranslations('Appearance')
  const id = useId()
  const [pending, setPending] = useState<Appearance | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  return (
    <section className="min-w-0 space-y-2" aria-busy={busy}>
      <div className="flex items-center gap-1">
        <Label
          htmlFor={id}
          className="ml-1 text-[11px] font-normal uppercase tracking-widest text-muted-foreground"
        >
          {t('title')}
        </Label>
        <InfoPopover title={t('title')}>{t('help')}</InfoPopover>
      </div>
      <Combobox
        id={id}
        value={pending ?? profile?.appearance ?? 'system'}
        allowDeselect={false}
        showSelectedAvatar={false}
        className="h-14 min-w-0 bg-canvas-parchment dark:bg-surface-tile-1 border-none rounded-sm text-lg font-normal **:font-normal"
        testId="preferences-appearance"
        options={['light', 'dark', 'system'].map((value) => ({
          value,
          label: t(value),
        }))}
        onValueChange={async (value) => {
          if (busy || value === (profile?.appearance ?? 'system')) return
          const appearance = appearanceSchema.parse(value)
          setBusy(true)
          setPending(appearance)
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
            setPending(null)
          }
        }}
      />
      {error && <p role="alert">{t('error')}</p>}
    </section>
  )
}
