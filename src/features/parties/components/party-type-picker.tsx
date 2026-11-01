'use client'

import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { Tick02Icon as Check } from '@hugeicons/core-free-icons'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import { PARTY_TYPES } from '@/validators'
import type { PartyType } from '@/types'

export function usePartyTypeLabel() {
  const t = useTranslations('Parties')
  return (type: PartyType | null | undefined) => {
    switch (type) {
      case 'customer':
        return t('partyTypeCustomer')
      case 'supplier':
        return t('partyTypeSupplier')
      case 'vendor':
        return t('partyTypeVendor')
      default:
        return t('partyTypeUnset')
    }
  }
}

interface PartyTypePickerProps {
  value: PartyType | null | undefined
  onChange: (value: PartyType | null) => void
  title?: React.ReactNode
}

/** Single-select pills; tapping the active pill clears the selection. */
export function PartyTypePicker({
  value,
  onChange,
  title,
}: PartyTypePickerProps) {
  const t = useTranslations('Parties')
  const label = usePartyTypeLabel()

  return (
    <FilterPillSection title={title ?? t('partyTypeOptional')}>
      {PARTY_TYPES.map((type) => {
        const active = value === type
        return (
          <button
            key={type}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : type)}
            className={filterPillClassName(active)}
          >
            <span className="text-sm font-bold">{label(type)}</span>
            {active && (
              <HugeiconsIcon icon={Check} className="h-4 w-4 stroke-[3]" />
            )}
          </button>
        )
      })}
    </FilterPillSection>
  )
}
