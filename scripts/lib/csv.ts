import { UsageError } from './errors'

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF/LF, header row. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const source = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field === '') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (inQuotes) throw new UsageError('CSV has an unterminated quoted field.')
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((cells) => cells.some((cell) => cell.trim()))
  if (nonEmpty.length === 0) throw new UsageError('CSV file is empty.')

  const header = nonEmpty[0].map((cell) => cell.trim().toLowerCase())
  return nonEmpty
    .slice(1)
    .map((cells) =>
      Object.fromEntries(
        header.map((key, column) => [key, (cells[column] ?? '').trim()]),
      ),
    )
}

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(
  rows: Record<string, string | number | null | undefined>[],
  columns: string[],
): string {
  const lines = [columns.join(',')]
  for (const row of rows) {
    lines.push(
      columns.map((key) => escapeCell(String(row[key] ?? ''))).join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
