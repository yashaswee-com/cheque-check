'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useEmailLink } from '../hooks/use-email-link'
import { EmailLinkError } from '../email-link.types'
import { logger } from '@/lib/logger'
const codes = [
  'invalid_email',
  'email_in_use',
  'already_linked',
  'rate_limited',
  'unauthorized',
  'send_failed',
] as const
export function EmailLinkSection() {
  const query = useEmailLink(),
    t = useTranslations('EmailLink')
  const [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null)
  return (
    <section className="space-y-3">
      <Label htmlFor="verified-email">{t('title')}</Label>
      <Input
        id="verified-email"
        readOnly
        value={query.data?.email ?? ''}
        placeholder={query.isLoading ? t('loading') : t('unlinked')}
      />
      {query.error ? (
        <div role="alert">
          {t('loadError')}
          <Button type="button" onClick={() => void query.refresh()}>
            {t('refresh')}
          </Button>
        </div>
      ) : (
        query.data &&
        !query.data.email && (
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              if (busy) return
              setBusy(true)
              setError(null)
              setPending(false)
              try {
                await query.send(email)
                setPending(true)
              } catch (error) {
                logger.error('Email verification failed', error)
                const code =
                  error instanceof EmailLinkError ? error.code : 'send_failed'
                setError(
                  t(codes.find((value) => value === code) ?? 'send_failed'),
                )
              } finally {
                setBusy(false)
              }
            }}
            className="space-y-2"
          >
            <Label htmlFor="link-email">{t('newEmail')}</Label>
            <Input
              id="link-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              disabled={busy}
            />
            <Button
              type="submit"
              disabled={busy || !email.trim()}
              loading={busy}
            >
              {t('send')}
            </Button>
          </form>
        )
      )}
      {pending && !query.data?.email && <p role="status">{t('pending')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
