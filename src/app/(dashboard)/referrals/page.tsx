'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useReferrals } from '@/features/referrals/hooks/use-referrals'
import { referralCodeSchema } from '@/validators/referral'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Link01Icon, HashtagIcon } from '@hugeicons/core-free-icons'
import { logger } from '@/lib/logger'
import {
  useReferralLink,
  clearReferralLink,
} from '@/features/referrals/hooks/use-referral-link'

export default function ReferralsPage() {
  const t = useTranslations('Referrals')
  const query = useReferrals()
  const [manualCode, setCode] = useState<string | null>(null)
  const pending = useReferralLink()
  const code = manualCode ?? pending.code
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const link =
    query.data?.code && pending.origin
      ? `${pending.origin}/referrals?ref=${query.data.code}`
      : ''
  const [shared, setShared] = useState(false)
  const perform = async (action: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (error) {
      logger.error('Referral action failed', error)
      setError(error instanceof Error ? error.message : t('error'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5 pb-24">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>{t('rules')}</p>
      {error && <p role="alert">{error}</p>}
      {pending.error && <p role="alert">{t('invalid')}</p>}
      {query.error ? (
        <div>
          <p role="alert">{t('error')}</p>
          <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
        </div>
      ) : query.isLoading ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          {query.data?.eligible && query.data.code ? (
            <section className="rounded-xl border p-4 space-y-2">
              <h2 className="font-semibold">{t('yourCode')}</h2>
              <p>{query.data.code}</p>
              <Input
                readOnly
                value={link}
                aria-label={t('shareLink')}
                leftIcon={Link01Icon}
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (navigator.share)
                      await navigator.share({ title: 'ChequeCheck', url: link })
                    else await navigator.clipboard.writeText(link)
                    setShared(true)
                  })
                }
              >
                {t('share')}
              </Button>
              {shared && <p role="status">{t('shared')}</p>}
            </section>
          ) : (
            <p>{t('qualify')}</p>
          )}
          <section className="space-y-2">
            <Label htmlFor="referral-code" required>
              {t('apply')}
            </Label>
            <Input
              id="referral-code"
              leftIcon={HashtagIcon}
              value={query.data?.applied_code ?? code}
              maxLength={12}
              disabled={!!query.data?.applied_code || busy}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              disabled={
                busy ||
                !!query.data?.applied_code ||
                !referralCodeSchema.safeParse(code).success
              }
              onClick={() =>
                void perform(async () => {
                  await query.apply(code)
                  clearReferralLink()
                })
              }
            >
              {t('apply')}
            </Button>
            {query.data?.applied_code && <p role="status">{t('applied')}</p>}
          </section>
          <section className="space-y-2">
            <h2 className="font-semibold">{t('wallet')}</h2>
            {query.data?.wallets.length ? (
              query.data.wallets.map((wallet) => (
                <p key={wallet.currency}>
                  {t('balance', {
                    amount: (wallet.balance / 100).toFixed(2),
                    reserved: (wallet.reserved / 100).toFixed(2),
                  })}
                </p>
              ))
            ) : (
              <p>{t('emptyWallet')}</p>
            )}
            <p className="text-sm">{t('walletRules')}</p>
            <Link className="underline" href="/features/catalog">
              {t('topups')}
            </Link>
            <h3>{t('recent')}</h3>
            <ul>
              {query.data?.entries.map((entry) => (
                <li key={entry.id}>
                  {t(`entries.${entry.kind}`)}: INR{' '}
                  {(entry.amount / 100).toFixed(2)}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
