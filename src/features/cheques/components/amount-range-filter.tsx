'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Money03Icon } from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useChequeAmountBounds } from '@/features/cheques/hooks/use-cheque-list'
import { FieldError } from '@/components/ui/field-error'
import { Button } from '@/components/ui/button'
import { useDisplayFormat } from '@/features/profile/hooks/use-display-format'

/** Rounds the slider to ~100 stops so large ledgers stay easy to drag. */
export function amountSliderScale(ceiling: number) {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(ceiling)) - 2)
  return { step, max: Math.ceil(ceiling / step) * step }
}

function toNumber(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function AmountRangeFilter({
  businessId,
  min,
  max,
  onChange,
}: {
  businessId?: string
  min: string
  max: string
  onChange: (key: 'min_amount' | 'max_amount', value: string) => void
}) {
  const t = useTranslations('Cheques')
  const display = useDisplayFormat()
  const bounds = useChequeAmountBounds(businessId)
  const signature = `${min}|${max}`
  const [draft, setDraft] = useState<{ base: string; value: number[] }>()
  const scale =
    bounds.data && bounds.data.max > bounds.data.min
      ? {
          ...amountSliderScale(bounds.data.max),
          min: bounds.data.min,
          max: bounds.data.max,
        }
      : null
  const clamp = (value: number) =>
    Math.min(Math.max(value, scale?.min ?? 0), scale?.max ?? value)
  const committed = [
    clamp(toNumber(min) ?? scale?.min ?? 0),
    clamp(toNumber(max) ?? scale?.max ?? 0),
  ]
  // Hold the dragged value until the URL catches up to avoid a visual snap-back.
  const value = draft?.base === signature ? draft.value : committed

  return (
    <div className="space-y-3" data-testid="amount-range-filter">
      <h3 className="text-sm font-normal">{t('amountRange')}</h3>
      {bounds.error && (
        <div className="space-y-2">
          <FieldError>{t('amountBoundsFailed')}</FieldError>
          <Button variant="outline" onClick={() => bounds.refetch()}>
            {t('retryAmountBounds')}
          </Button>
        </div>
      )}
      {scale && (
        <div className="space-y-1 px-1">
          <Slider
            min={scale.min}
            max={scale.max}
            step={Math.min(scale.step, scale.max - scale.min)}
            value={value}
            thumbCollisionBehavior="push"
            thumbLabels={[t('filter_min_amount'), t('filter_max_amount')]}
            onValueChange={(next) =>
              setDraft({
                base: signature,
                value: Array.isArray(next) ? next : [next],
              })
            }
            onValueCommitted={(next) => {
              if (!Array.isArray(next)) return
              const [low, high] = next
              if (low !== committed[0])
                onChange('min_amount', low > scale.min ? String(low) : '')
              if (high !== committed[1])
                onChange('max_amount', high < scale.max ? String(high) : '')
            }}
          />
          <div
            className="flex justify-between text-xs text-muted-foreground tabular-nums"
            aria-hidden
          >
            <span>{display.currency(value[0])}</span>
            <span>{display.currency(value[1])}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {(['min_amount', 'max_amount'] as const).map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`filter-${key}`}>{t(`filter_${key}`)}</Label>
            <Input
              id={`filter-${key}`}
              leftIcon={Money03Icon}
              inputMode="decimal"
              type="number"
              min={0}
              step="any"
              enableMic={false}
              value={key === 'min_amount' ? min : max}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
