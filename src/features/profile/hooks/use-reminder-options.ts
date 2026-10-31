import { useTranslations } from 'next-intl'
import { REMINDERS_PER_DAY, REMINDER_DAYS } from '../lib/preference-options'

export function useReminderOptions() {
  const t = useTranslations('Onboarding')
  return {
    REMINDERS_PER_DAY_OPTIONS: REMINDERS_PER_DAY.map((count) => ({
      label: t('remindersPerDay', { count }),
      value: String(count),
    })),
    REMINDER_FREQUENCY_OPTIONS: REMINDER_DAYS.map((count) => ({
      label: t('reminderDays', { count }),
      value: String(count),
    })),
  }
}
