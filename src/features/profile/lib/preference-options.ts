import {
  currencySchema,
  dateFormatSchema,
  timeFormatSchema,
  localeSchema,
} from '@/validators/profile'

const currencyLabels: Record<(typeof currencySchema.options)[number], string> =
  {
    '₹': '₹ (INR)',
    $: '$ (USD)',
    '€': '€ (EUR)',
    '£': '£ (GBP)',
  }
const dateLabels: Record<(typeof dateFormatSchema.options)[number], string> = {
  'dd/MM/yyyy': 'DD/MM/YYYY',
  'MM/dd/yyyy': 'MM/DD/YYYY',
  'yyyy-MM-dd': 'YYYY-MM-DD',
}
const timeLabels: Record<(typeof timeFormatSchema.options)[number], string> = {
  '12h': '12-hour (AM/PM)',
  '24h': '24-hour',
}
const languageLabels: Record<(typeof localeSchema.options)[number], string> = {
  en: 'English',
  hi: 'Hindi',
  'hi-en': 'Hinglish',
}

export const CURRENCY_OPTIONS = currencySchema.options.map((value) => ({
  value,
  label: currencyLabels[value],
}))
export const DATE_FORMAT_OPTIONS = dateFormatSchema.options.map((value) => ({
  value,
  label: dateLabels[value],
}))
export const TIME_FORMAT_OPTIONS = timeFormatSchema.options.map((value) => ({
  value,
  label: timeLabels[value],
}))
export const LANGUAGE_OPTIONS = localeSchema.options.map((value) => ({
  value,
  label: languageLabels[value],
}))
export const ONBOARDING_LANGUAGE_OPTIONS = LANGUAGE_OPTIONS
export const TIMEZONE_OPTIONS = [
  { label: 'IST (UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'UTC', value: 'UTC' },
  { label: 'EST (UTC-5)', value: 'America/New_York' },
  { label: 'GMT (UTC+0)', value: 'Europe/London' },
]
export const REMINDERS_PER_DAY = [1, 2, 3]
export const REMINDER_DAYS = [1, 3, 7]
