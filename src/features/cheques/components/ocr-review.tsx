'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Spinner } from '@/components/ui/spinner'
import type { useOcrExtraction } from '../hooks/use-ocr-extraction'
import type { OcrField } from '../services/ocr-contract'
import { isScanPending } from '@/validators/cheque-scan'
import { OcrEntityCreation } from './ocr-entity-creation'

type EntityOption = { value: string; label: string }

export function OcrReview({
  scan,
  partyOptions = [],
  accountOptions = [],
  partyId,
  accountId,
  duplicateConfirmation,
  onDone,
}: {
  scan: ReturnType<typeof useOcrExtraction>
  partyOptions?: EntityOption[]
  accountOptions?: EntityOption[]
  partyId?: string
  accountId?: string
  duplicateConfirmation?: ReactNode
  onDone?: () => void
}) {
  const t = useTranslations('Ocr')
  const [selected, setSelected] = useState<OcrField[]>([])
  const [step, setStep] = useState<'details' | 'matches' | null>(null)
  const [choosingParty, setChoosingParty] = useState(false)
  const job = scan.job
  const reviewable =
    job &&
    ['ready_partial', 'accepted_partial', 'ready_high'].includes(job.status)
  const usefulSelection = selected.some(
    (field) =>
      job?.reliability?.[field]?.reason === 'clear' &&
      job.details?.[field] != null,
  )
  const stage = step ?? (scan.applied ? 'matches' : 'details')
  const busy = scan.isExtracting || scan.isCreatingInline || choosingParty
  async function chooseParty(id: string) {
    setChoosingParty(true)
    try {
      await scan.chooseParty(id)
    } finally {
      setChoosingParty(false)
    }
  }
  const manual = (
    <Button
      type="button"
      variant="ghost"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        await scan.cancel()
        onDone?.()
      }}
    >
      {t('manual')}
    </Button>
  )
  return (
    <section
      className="space-y-4 text-sm"
      aria-label={t('title')}
      data-clarity-mask="true"
      data-monitoring-private
    >
      <div className="rounded-xl bg-muted/40 p-3">
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 font-medium"
        >
          {scan.isExtracting && <Spinner className="size-4 shrink-0" />}
          {scan.isExtracting && reviewable
            ? t('flow.applying')
            : scan.isExtracting
              ? t('scanning')
              : job
                ? t(`states.${job.status}`)
                : t('ready')}
        </p>
        {job && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`credits.${job.credit_state}`)}
          </p>
        )}
      </div>
      {scan.errorCode &&
        !(scan.duplicateWarning && scan.errorCode === 'DUPLICATE_ENTITY') && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-destructive"
          >
            {t.has(`errors.${scan.errorCode}`)
              ? t(`errors.${scan.errorCode}`)
              : t('errors.SCAN_UNAVAILABLE')}
          </p>
        )}
      {duplicateConfirmation && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
        >
          {duplicateConfirmation}
        </div>
      )}
      {scan.needsConsent ? (
        <div className="space-y-3">
          <p>{t('disclosure')}</p>
          <p className="text-xs text-muted-foreground">
            {t('billingDisclosure')}
          </p>
          <Link
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block underline"
          >
            {t('privacy')}
          </Link>
          <Button
            type="button"
            className="w-full"
            onClick={scan.acknowledgeConsent}
            disabled={busy}
          >
            {t('agree')}
          </Button>
          {manual}
        </div>
      ) : scan.modeMismatch ? (
        <div className="space-y-3">
          <p role="alert">{t('modeChanged')}</p>
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={scan.remap}
          >
            {t('remap')}
          </Button>
        </div>
      ) : reviewable && job.details ? (
        <>
          <ol
            className="grid grid-cols-2 gap-2 text-xs"
            aria-label={t('flow.progress')}
          >
            {(['details', 'matches'] as const).map((item, index) => (
              <li
                key={item}
                aria-current={stage === item ? 'step' : undefined}
                className={
                  stage === item
                    ? 'rounded-lg bg-primary/10 px-3 py-2 font-semibold text-primary'
                    : 'rounded-lg bg-muted/40 px-3 py-2 text-muted-foreground'
                }
              >
                {index + 1}. {t(`flow.${item}`)}
              </li>
            ))}
          </ol>
          {scan.unmatchedEntities ? (
            <OcrEntityCreation scan={scan} />
          ) : stage === 'details' ? (
            <>
              <div>
                <h3 className="font-semibold">{t('flow.detailsTitle')}</h3>
                <p className="mt-1 text-muted-foreground">{t('reviewHelp')}</p>
              </div>
              <div className="space-y-2">
                {(['amount', 'cheque_number', 'cheque_date'] as const).map(
                  (field) => (
                    <label
                      key={field}
                      className="flex items-start gap-3 rounded-xl border p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0"
                        checked={selected.includes(field)}
                        disabled={
                          job.details?.[field] == null || scan.applied || busy
                        }
                        onChange={(event) =>
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, field]
                              : previous.filter((item) => item !== field),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-muted-foreground">
                          {t(`fields.${field}`)}
                        </span>
                        <span className="block break-words text-base font-semibold">
                          {job.details?.[field] ?? t('missing')}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {t(
                            `reasons.${job.reliability?.[field]?.reason ?? 'missing'}`,
                          )}
                        </span>
                      </span>
                    </label>
                  ),
                )}
              </div>
              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer font-medium">
                  {t('flow.evidence')}
                </summary>
                <dl className="mt-3 space-y-3 text-xs">
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
                      <dt className="text-muted-foreground">
                        {t(`fields.${field}`)}
                      </dt>
                      <dd className="break-words font-medium">
                        {field === 'account_number' &&
                        job.details?.account_number
                          ? `****${job.details.account_number.slice(-4)}`
                          : (job.details?.[field] ?? t('missing'))}
                        {' · '}
                        {t(
                          `levels.${job.reliability?.[field]?.level ?? 'unusable'}`,
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
              {scan.applied && <p role="status">{t('applied')}</p>}
              {job.review_expires_at && job.credit_state === 'reserved' && (
                <p className="text-xs text-muted-foreground">
                  {t('reviewExpiry')}
                </p>
              )}
              <div className="sticky bottom-0 space-y-2 border-t bg-popover pt-3 pb-1">
                <Button
                  type="button"
                  className="w-full h-auto min-h-11 whitespace-normal"
                  disabled={busy || (!scan.applied && !usefulSelection)}
                  onClick={
                    scan.applied
                      ? () => setStep('matches')
                      : async () => {
                          await scan.accept(selected)
                          setStep(null)
                        }
                  }
                >
                  {scan.applied
                    ? t('flow.nextMatches')
                    : job.credit_state === 'reserved'
                      ? t('acceptCredit')
                      : t('apply')}
                </Button>
                {manual}
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="font-semibold">{t('flow.matchesTitle')}</h3>
                <p className="mt-1 text-muted-foreground">
                  {t('flow.matchesHelp')}
                </p>
              </div>
              {(['parties', 'accounts'] as const).map((kind) => {
                const isParty = kind === 'parties'
                const options = isParty ? partyOptions : accountOptions
                const chosenId = isParty ? partyId : accountId
                return (
                  <div key={kind} className="space-y-3 rounded-xl border p-3">
                    <h4 className="font-semibold">
                      {t(isParty ? 'partyMatches' : 'accountMatches')}
                    </h4>
                    {isParty && job.mode === 'Inward' && (
                      <p className="text-xs text-muted-foreground">
                        {t('confirmAssociation')}
                      </p>
                    )}
                    {!scan.candidates[kind].length && (
                      <p className="text-muted-foreground">
                        {t('flow.noMatches')}
                      </p>
                    )}
                    {scan.candidates[kind].length > 1 && (
                      <p className="text-xs text-amber-700">
                        {t('flow.multipleMatches')}
                      </p>
                    )}
                    <div className="space-y-2">
                      {scan.candidates[kind].map((candidate) => (
                        <Button
                          key={candidate.id}
                          type="button"
                          variant="outline"
                          aria-pressed={chosenId === candidate.id}
                          disabled={busy}
                          className="h-auto min-h-12 w-full justify-start whitespace-normal text-left data-[pressed]:border-primary aria-pressed:border-primary aria-pressed:bg-primary/5"
                          onClick={() =>
                            isParty
                              ? chooseParty(candidate.id)
                              : scan.chooseAccount(candidate.id)
                          }
                        >
                          <span className="min-w-0 break-words">
                            <span className="block font-medium">
                              {options.find(
                                (option) => option.value === candidate.id,
                              )?.label ?? candidate.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {chosenId === candidate.id
                                ? t('flow.selected')
                                : t(
                                    'exact' in candidate && candidate.exact
                                      ? 'exact'
                                      : candidate.reason.includes('bank')
                                        ? 'bankEvidence'
                                        : 'nameEvidence',
                                  )}
                            </span>
                          </span>
                        </Button>
                      ))}
                    </div>
                    <label
                      className="block text-xs text-muted-foreground"
                      htmlFor={`scan-${kind}`}
                    >
                      {t(
                        isParty ? 'flow.browseParties' : 'flow.browseAccounts',
                      )}
                    </label>
                    <Combobox
                      id={`scan-${kind}`}
                      options={options}
                      value={chosenId}
                      disabled={busy}
                      allowDeselect={false}
                      placeholder={t(
                        isParty ? 'flow.browseParties' : 'flow.browseAccounts',
                      )}
                      onValueChange={(id) => {
                        if (isParty) void chooseParty(id)
                        else scan.chooseAccount(id)
                      }}
                    />
                  </div>
                )
              })}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">
                  {t('flow.aboutMatches')}
                </summary>
                <p className="mt-2">{t('matchHelp')}</p>
              </details>
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-11 w-full whitespace-normal"
                disabled={busy}
                onClick={scan.openCreate}
              >
                {t('create')}
              </Button>
              <div className="sticky bottom-0 space-y-2 border-t bg-popover pt-3 pb-1">
                <p className="text-xs text-muted-foreground">
                  {t('flow.finishHelp')}
                </p>
                <Button
                  type="button"
                  className="w-full"
                  disabled={busy}
                  onClick={onDone}
                >
                  {t('flow.done')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  disabled={busy}
                  onClick={() => setStep('details')}
                >
                  {t('flow.backDetails')}
                </Button>
              </div>
            </>
          )}
        </>
      ) : (job && isScanPending(job)) || scan.isExtracting ? (
        <div className="space-y-3">
          <p className="text-muted-foreground">{t('flow.backgroundHelp')}</p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={scan.cancel}
          >
            {t('cancel')}
          </Button>
          {onDone && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onDone}
            >
              {t('flow.closeForNow')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-muted-foreground">{t('retakeHelp')}</p>
          {scan.errorCode ? (
            <>
              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={scan.recover}
              >
                {t('recover')}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t('flow.recoverHelp')}
              </p>
            </>
          ) : (
            <Button
              type="button"
              className="w-full"
              disabled={busy}
              onClick={scan.retry}
            >
              {t('retry')}
            </Button>
          )}
          {manual}
        </div>
      )}
    </section>
  )
}
