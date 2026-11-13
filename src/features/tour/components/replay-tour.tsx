'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useProfile } from '@/features/profile/hooks/use-profile'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
export function ReplayTour() {
  const t = useTranslations('Tour'),
    router = useRouter(),
    { updateProfile } = useProfile()
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false)
  return (
    <section>
      <Button
        variant="outline"
        className="w-full font-normal"
        disabled={busy}
        onClick={async () => {
          if (busy) return
          setBusy(true)
          setError(false)
          try {
            await updateProfile({ tour_status: 'pending' })
            router.push('/dashboard')
          } catch (error) {
            logger.error('Tour replay could not be saved', error)
            setError(true)
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('replay')}
      </Button>
      {error && <p role="alert">{t('saveError')}</p>}
    </section>
  )
}
