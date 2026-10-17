const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
})
const DATE = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : DATE_TIME.format(date)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : DATE.format(date)
}

/** "in 3d", "5h ago" - compact relative time for tables. */
export function formatRelative(
  value: string | null | undefined,
  now = Date.now(),
): string {
  if (!value) return ''
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return value
  const diff = time - now
  const abs = Math.abs(diff)
  const units: [number, string][] = [
    [86_400_000, 'd'],
    [3_600_000, 'h'],
    [60_000, 'm'],
  ]
  for (const [size, label] of units) {
    if (abs >= size) {
      const amount = Math.floor(abs / size)
      return diff >= 0 ? `in ${amount}${label}` : `${amount}${label} ago`
    }
  }
  return 'now'
}

export function formatPaise(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100)
}

export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : ''
}

export function addDays(days: number, from = new Date()): Date {
  return new Date(from.getTime() + days * 86_400_000)
}
