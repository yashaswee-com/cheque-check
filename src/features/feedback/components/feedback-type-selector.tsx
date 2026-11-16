'use client'

import { useTranslations } from 'next-intl'
import {
  FilterPillSection,
  filterPillClassName,
} from '@/components/ui/pill-scroller'
import {
  feedbackCategories,
  type FeedbackCategory,
} from '@/validators/feedback'

export function FeedbackTypeSelector({
  value,
  onChange,
}: {
  value: FeedbackCategory
  onChange: (value: FeedbackCategory) => void
}) {
  const t = useTranslations('Feedback')
  return (
    <FilterPillSection title={t('categoryLabel')}>
      {feedbackCategories.map((category) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          className={filterPillClassName(value === category)}
          onClick={() => onChange(category)}
        >
          {t(`categories.${category}`)}
        </button>
      ))}
    </FilterPillSection>
  )
}
