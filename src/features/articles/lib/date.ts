const articleMonthFormatter = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  timeZone: 'UTC',
})

export function ordinalSuffix(day: number) {
  const remainder = day % 100
  if (remainder >= 11 && remainder <= 13) return 'th'
  switch (day % 10) {
    case 1:
      return 'st'
    case 2:
      return 'nd'
    case 3:
      return 'rd'
    default:
      return 'th'
  }
}

export function articleDateParts(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid article date: ${value}`)
  }
  const day = date.getUTCDate()
  return {
    day,
    suffix: ordinalSuffix(day),
    month: articleMonthFormatter.format(date),
    year: date.getUTCFullYear(),
  }
}
