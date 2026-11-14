'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { useOcrExtraction } from '../hooks/use-ocr-extraction'
import type { OcrField } from '../services/ocr-contract'
import { isScanPending } from '@/validators/cheque-scan'

export function OcrReview({
  scan,
}: {
  scan: ReturnType<typeof useOcrExtraction>
}) {
  const t = useTranslations('Ocr')
  const [selected, setSelected] = useState<OcrField[]>([])
  const job = scan.job
  const reviewable =
    job &&
    ['ready_partial', 'accepted_partial', 'ready_high'].includes(job.status)
  const usefulSelection = selected.some(
    (field) =>
      job?.reliability?.[field]?.reason === 'clear' &&
      job.details?.[field] !== null,
  )
  return (
    <section
      className="space-y-3 rounded-lg border p-4 text-sm"
      aria-label={t('title')}
      data-clarity-mask="true"
      data-monitoring-private
    >
      <h2 className="font-semibold">{t('title')}</h2>
      <div role="status" aria-live="polite">
        {scan.isExtracting
          ? t('scanning')
          : job
            ? t(`states.${job.status}`)
            : t('ready')}
      </div>
      {job && (
        <p className="text-xs text-muted-foreground">
          {t(`credits.${job.credit_state}`)}
        </p>
      )}
      {scan.errorCode && (
        <p role="alert" className="text-destructive">
          {t.has(`errors.${scan.errorCode}`)
            ? t(`errors.${scan.errorCode}`)
            : t('errors.SCAN_UNAVAILABLE')}
        </p>
      )}
      {scan.needsConsent && (
        <div className="space-y-3">
          <p>{t('disclosure')}</p>
          <p className="text-xs">{t('billingDisclosure')}</p>
          <Link href="/privacy" className="underline">
            {t('privacy')}
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void scan.acknowledgeConsent()}
              disabled={scan.isExtracting}
            >
              {t('agree')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void scan.cancel()}
            >
              {t('manual')}
            </Button>
          </div>
        </div>
      )}
      {scan.modeMismatch && (
        <div>
          <p role="alert">{t('modeChanged')}</p>
          <Button type="button" onClick={() => void scan.remap()}>
            {t('remap')}
          </Button>
        </div>
      )}
      {reviewable && job.details && !scan.modeMismatch && (
        <>
          <p>{t('reviewHelp')}</p>
          <div className="space-y-2">
            {(['amount', 'cheque_number', 'cheque_date'] as const).map(
              (field) => (
                <label
                  key={field}
                  className="flex items-start gap-3 rounded border p-3"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selected.includes(field)}
                    disabled={job.details?.[field] === null || scan.applied}
                    onChange={(event) =>
                      setSelected((previous) =>
                        event.target.checked
                          ? [...previous, field]
                          : previous.filter((item) => item !== field),
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">
                      {t(`fields.${field}`)}:{' '}
                      {job.details?.[field] ?? t('missing')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t(
                        `levels.${job.reliability?.[field]?.level ?? 'unusable'}`,
                      )}
                      {' — '}
                      {t(
                        `reasons.${job.reliability?.[field]?.reason ?? 'missing'}`,
                      )}
                    </span>
                  </span>
                </label>
              ),
            )}
          </div>
          <dl className="space-y-2 text-xs">
            {(
              [
                'account_name',
                'payee_name',
                'account_number',
                'ifsc_code',
                'bank_name',
              ] as const
            ).map((field) => (
              <div key={field}>
                <dt className="font-medium">{t(`fields.${field}`)}</dt>
                <dd>
                  {field === 'account_number' && job.details?.account_number
                    ? `****${job.details.account_number.slice(-4)}`
                    : (job.details?.[field] ?? t('missing'))}
                  {' · '}
                  {t(`levels.${job.reliability?.[field]?.level ?? 'unusable'}`)}
                </dd>
              </div>
            ))}
          </dl>
          {scan.applied ? (
            <p role="status">{t('applied')}</p>
          ) : (
            <Button
              type="button"
              disabled={!usefulSelection || scan.isExtracting}
              onClick={() => void scan.accept(selected)}
            >
              {job.credit_state === 'reserved' ? t('acceptCredit') : t('apply')}
            </Button>
          )}
          {job.review_expires_at && job.credit_state === 'reserved' && (
            <p className="text-xs">{t('reviewExpiry')}</p>
          )}
          {scan.candidates.parties.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">{t('partyMatches')}</h3>
              {job.mode === 'Inward' && (
                <p className="text-xs">{t('confirmAssociation')}</p>
              )}
              {scan.candidates.parties.map((party) => (
                <Button
                  key={party.id}
                  type="button"
                  variant="outline"
                  className="mr-2 h-auto whitespace-normal text-left"
                  onClick={() => void scan.chooseParty(party.id)}
                >
                  {party.name} ({Math.round(party.score * 100)}/100)
                  {' · '}
                  {t(
                    party.reason.includes('bank')
                      ? 'bankEvidence'
                      : 'nameEvidence',
                  )}
                </Button>
              ))}
            </div>
          )}
          {scan.candidates.accounts.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">{t('accountMatches')}</h3>
              {scan.candidates.accounts.map((account) => (
                <Button
                  key={account.id}
                  type="button"
                  variant="outline"
                  className="mr-2 h-auto whitespace-normal text-left"
                  onClick={() => scan.chooseAccount(account.id)}
                >
                  {account.name} (
                  {account.exact
                    ? t('exact')
                    : `${Math.round(account.score * 100)}/100`}
                  )
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t('matchHelp')}</p>
          <Button type="button" variant="outline" onClick={scan.openCreate}>
            {t('create')}
          </Button>
        </>
      )}
      {!scan.needsConsent && (
        <div className="flex flex-wrap gap-2">
          {job && isScanPending(job) ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void scan.cancel()}
            >
              {t('cancel')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={scan.isExtracting}
                onClick={() => void scan.retry()}
              >
                {t('retry')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={scan.isExtracting}
                onClick={() => void scan.recover()}
              >
                {t('recover')}
              </Button>
            </>
          )}
          {job?.credit_state === 'reserved' && !isScanPending(job) && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void scan.cancel()}
            >
              {t('discard')}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t('retakeHelp')}</p>
    </section>
  )
}
