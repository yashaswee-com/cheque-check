'use client'

import { useTranslations } from 'next-intl'
import { DateInput } from '@/components/ui/date-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { useBanks } from '@/features/accounts/hooks/use-banks'
import { bankSearchLabel } from '@/features/accounts/lib/bank-details'
import type { ChequeStatus } from '@/types'

const statusGroups: { key: string; values: ChequeStatus[] }[] = [
  { key: 'pendingStatus', values: ['Issued', 'Received'] },
  { key: 'cleared', values: ['Cleared'] },
  { key: 'returnedStatus', values: ['Bounced'] },
]

export function AdvancedChequeFilters({
  params,
  onChange,
  onClear,
  onValidityChange,
}: {
  params: URLSearchParams
  onChange: (key: string, value: string) => void
  onClear: () => void
  onValidityChange: (key: string, valid: boolean) => void
}) {
  const t = useTranslations('Cheques')
  const common = useTranslations('Common')
  const party = useTranslations('Parties')
  const banks = useBanks()
  const selectedBanks = params.get('bank_ids')?.split(',') ?? []
  const statuses = params.get('statuses')?.split(',') ?? []
  return (
    <>
      <FilterPillSection title={t('filterStatus')}>
        <button
          type="button"
          className={filterPillClassName(!statuses.length)}
          aria-pressed={!statuses.length}
          onClick={() => onChange('statuses', '')}
        >
          {common('all')}
        </button>
        {statusGroups.map(({ key, values }) => {
          const selected = values.every((value) => statuses.includes(value))
          return (
            <button
              key={key}
              type="button"
              className={filterPillClassName(selected)}
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  'statuses',
                  (selected
                    ? statuses.filter(
                        (value) => !values.some((status) => status === value),
                      )
                    : [...new Set([...statuses, ...values])]
                  ).join(','),
                )
              }
            >
              {key === 'cleared' ? common('cleared') : t(key)}
            </button>
          )
        })}
      </FilterPillSection>
      <FilterPillSection title={t('partyTypeFilter')}>
        {['', 'customer', 'supplier', 'vendor', 'unclassified'].map((type) => (
          <button
            key={type}
            type="button"
            className={filterPillClassName(
              (params.get('party_type') ?? '') === type,
            )}
            aria-pressed={(params.get('party_type') ?? '') === type}
            onClick={() => onChange('party_type', type)}
          >
            {type
              ? type === 'unclassified'
                ? t('unclassified')
                : party(`partyType${type[0].toUpperCase()}${type.slice(1)}`)
              : common('all')}
          </button>
        ))}
      </FilterPillSection>
      <div className="grid grid-cols-2 gap-3">
        {['from', 'to', 'due_from', 'due_to'].map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`filter-${key}`}>{t(`filter_${key}`)}</Label>
            <DateInput
              id={`filter-${key}`}
              value={
                (key === 'from' || key === 'to' ? params.get('date') : null) ??
                params.get(key) ??
                ''
              }
              onValidityChange={(valid) => onValidityChange(key, valid)}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </div>
        ))}
        {['min_amount', 'max_amount'].map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`filter-${key}`}>{t(`filter_${key}`)}</Label>
            <Input
              id={`filter-${key}`}
              inputMode="decimal"
              enableMic={false}
              value={params.get(key) ?? ''}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('bankFilter')}</h3>
        {banks.error ? (
          <p role="alert">{t('bankFilterError')}</p>
        ) : banks.isPending ? (
          <p role="status">{common('loading')}</p>
        ) : (
          <Combobox
            options={[
              ...(banks.data ?? [])
                .filter((bank) => !selectedBanks.includes(bank.id))
                .map((bank) => ({
                  value: bank.id,
                  label: bankSearchLabel(bank),
                })),
              ...(!selectedBanks.includes('unknown')
                ? [{ value: 'unknown', label: t('unknownBank') }]
                : []),
            ]}
            placeholder={t('bankFilter')}
            emptyMessage={t('noBanksMatch')}
            onValueChange={(id) => {
              if (id) onChange('bank_ids', [...selectedBanks, id].join(','))
            }}
          />
        )}
        <div className="flex flex-wrap gap-2">
          {selectedBanks.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant="outline"
              aria-label={t('removeBankFilter', {
                bank:
                  id === 'unknown'
                    ? t('unknownBank')
                    : (banks.data?.find((bank) => bank.id === id)?.name ?? id),
              })}
              onClick={() =>
                onChange(
                  'bank_ids',
                  selectedBanks.filter((bank) => bank !== id).join(','),
                )
              }
            >
              {id === 'unknown'
                ? t('unknownBank')
                : (banks.data?.find((bank) => bank.id === id)?.name ?? id)}{' '}
              &times;
            </Button>
          ))}
        </div>
      </div>
      <Button type="button" variant="outline" onClick={onClear}>
        {common('clearAllFilters')}
      </Button>
    </>
  )
}
