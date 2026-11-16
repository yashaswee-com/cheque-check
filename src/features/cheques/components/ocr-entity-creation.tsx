'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BankSelector } from '@/components/bank-selector'
import type { useOcrExtraction } from '../hooks/use-ocr-extraction'

export function OcrEntityCreation({
  scan,
}: {
  scan: ReturnType<typeof useOcrExtraction>
}) {
  const t = useTranslations('Ocr')
  const c = useTranslations('Cheques')
  const common = useTranslations('Common')
  const entities = scan.unmatchedEntities
  if (!entities) return null
  const { createOptions, setCreateOptions } = scan
  const hasSelection = createOptions.party || createOptions.account
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">{t('flow.createTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('flow.createHelp')}</p>
      {scan.duplicateWarning && (
        <div
          className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
          role="alert"
        >
          <p className="font-medium">{t('flow.sameName')}</p>
          <p className="text-sm">{t('errors.DUPLICATE_ENTITY')}</p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={scan.allowDuplicate}
              onChange={(event) => scan.setAllowDuplicate(event.target.checked)}
            />
            {t('duplicateConfirm')}
          </label>
        </div>
      )}
      {!entities.payee_name && !entities.account_number && (
        <p role="status">{t('flow.noCreationData')}</p>
      )}
      {entities.payee_name && (
        <div className="space-y-3 rounded-xl border p-3">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={createOptions.party}
              disabled={scan.isCreatingInline}
              onChange={(event) =>
                setCreateOptions((previous) => ({
                  ...previous,
                  party: event.target.checked,
                }))
              }
            />
            {c('createPartyFromScan', { name: entities.payee_name })}
          </label>
          {createOptions.party && (
            <div className="space-y-2">
              <label htmlFor="scan-party-contact" className="text-sm">
                {t('contact')}
              </label>
              <Input
                id="scan-party-contact"
                type="tel"
                autoComplete="tel"
                value={scan.partyContact}
                disabled={scan.isCreatingInline}
                onChange={(event) => scan.setPartyContact(event.target.value)}
              />
            </div>
          )}
        </div>
      )}
      {entities.account_number && (
        <div className="space-y-3 rounded-xl border p-3">
          <label className="flex items-start gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={createOptions.account}
              disabled={scan.isCreatingInline}
              onChange={(event) =>
                setCreateOptions((previous) => ({
                  ...previous,
                  account: event.target.checked,
                }))
              }
            />
            {c('createAccountFromScan', {
              name:
                entities.account_name ||
                `****${entities.account_number.slice(-4)}`,
            })}
          </label>
          {createOptions.account && (
            <div className="space-y-2">
              <p className="text-sm">{common('selectBank')}</p>
              <BankSelector
                value={entities.bank_id}
                onValueChange={(bank_id) =>
                  scan.setUnmatchedEntities((previous) =>
                    previous ? { ...previous, bank_id } : null,
                  )
                }
              />
            </div>
          )}
        </div>
      )}
      <div className="sticky bottom-0 space-y-2 border-t bg-popover pt-3 pb-1">
        <Button
          type="button"
          className="w-full whitespace-normal h-auto min-h-11"
          loading={scan.isCreatingInline}
          disabled={
            !hasSelection ||
            (createOptions.party && !scan.partyContact.trim()) ||
            (createOptions.account && !entities.bank_id) ||
            (scan.duplicateWarning && !scan.allowDuplicate)
          }
          onClick={scan.handleInlineCreate}
        >
          {c('createSelected')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={scan.isCreatingInline}
          onClick={() => scan.setUnmatchedEntities(null)}
        >
          {t('flow.backToMatches')}
        </Button>
      </div>
    </div>
  )
}
