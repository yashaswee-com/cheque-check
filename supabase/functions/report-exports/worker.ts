export interface ExportJob {
  id: string
  user_id: string
  format: 'csv' | 'json'
  status: string
  row_count: number
  part_count: number
  next_part: number
  claim_token: string | null
}
export interface ExportRow {
  position: number
  payload: Record<string, unknown>
}
export interface ExportDatabase {
  claim(): Promise<ExportJob | null>
  batch(job: ExportJob): Promise<ExportRow[]>
  advance(job: ExportJob): Promise<ExportJob>
  release(job: ExportJob, failed: boolean): Promise<void>
  expired(): Promise<ExportJob[]>
  cleaned(job: ExportJob): Promise<void>
}
export interface ExportStorage {
  upload(path: string, content: string): Promise<void>
  removeJob(prefix: string): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function parseExportJobs(value: unknown): ExportJob[] {
  if (!Array.isArray(value)) throw new Error('Invalid export job result')
  return value.map((job: unknown) => {
    if (
      !isRecord(job) ||
      typeof job.id !== 'string' ||
      typeof job.user_id !== 'string' ||
      (job.format !== 'csv' && job.format !== 'json') ||
      typeof job.status !== 'string' ||
      !['queued', 'processing', 'ready', 'failed', 'expired'].includes(
        job.status,
      ) ||
      typeof job.row_count !== 'number' ||
      !Number.isInteger(job.row_count) ||
      job.row_count < 1 ||
      job.row_count > 50000 ||
      typeof job.next_part !== 'number' ||
      !Number.isInteger(job.next_part) ||
      job.next_part < 0 ||
      typeof job.part_count !== 'number' ||
      job.part_count !== Math.ceil(job.row_count / 500) ||
      job.next_part > job.part_count ||
      (job.claim_token !== null && typeof job.claim_token !== 'string')
    )
      throw new Error('Invalid export job result')
    return {
      id: job.id,
      user_id: job.user_id,
      format: job.format,
      status: job.status,
      row_count: job.row_count,
      next_part: job.next_part,
      part_count: job.part_count,
      claim_token: job.claim_token,
    }
  })
}

export function parseExportRows(value: unknown): ExportRow[] {
  if (!Array.isArray(value) || value.length > 500)
    throw new Error('Invalid export snapshot result')
  return value.map((row: unknown) => {
    if (
      !isRecord(row) ||
      typeof row.position !== 'number' ||
      !Number.isInteger(row.position) ||
      !isRecord(row.payload)
    )
      throw new Error('Invalid export snapshot row')
    return { position: row.position, payload: row.payload }
  })
}

export function formatExportPart(job: ExportJob, rows: ExportRow[]): string {
  const expected = Math.min(500, job.row_count - job.next_part * 500)
  if (
    rows.length !== expected ||
    rows.some((row, index) => row.position !== job.next_part * 500 + index)
  )
    throw new Error('Invalid export snapshot batch')
  const last = job.next_part + 1 === job.part_count
  if (job.format === 'json') {
    return (
      (job.next_part === 0 ? '[\n' : ',\n') +
      rows.map((row) => JSON.stringify(row.payload)).join(',\n') +
      (last ? '\n]' : '')
    )
  }
  const cell = (value: unknown) => {
    if (
      value !== null &&
      value !== undefined &&
      typeof value !== 'string' &&
      typeof value !== 'number'
    )
      throw new Error('Invalid CSV snapshot cell')
    const text = String(value ?? '')
    // Spreadsheet text must not become an executable formula.
    const safe =
      typeof value === 'string' && /^[\s]*[=+@\-\t\r]/.test(text)
        ? "'" + text
        : text
    return `"${safe.replaceAll('"', '""')}"`
  }
  const nested = (value: unknown, key: string): unknown =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Reflect.get(value, key)
      : null
  return (
    (job.next_part === 0
      ? 'Cheque Number,Party,Account,Amount,Date,Type,Status,Notes\n'
      : '') +
    rows
      .map(({ payload: c }) =>
        [
          c.cheque_number,
          nested(c.party, 'name'),
          nested(nested(c.account, 'bank'), 'name'),
          c.amount,
          c.cheque_date,
          c.type,
          c.status,
          c.notes,
        ]
          .map(cell)
          .join(','),
      )
      .join('\n') +
    (last ? '' : '\n')
  )
}

export async function runExportWorker(
  db: ExportDatabase,
  storage: ExportStorage,
  now = Date.now,
): Promise<{ parts: number; ready: number; cleaned: number }> {
  const deadline = now() + 40000
  const result = { parts: 0, ready: 0, cleaned: 0 }
  for (const job of await db.expired()) {
    if (now() >= deadline) return result
    await storage.removeJob(`${job.user_id}/${job.id}`)
    await db.cleaned(job)
    result.cleaned++
  }
  // A single claimed job per tick prevents a fast account monopolizing the whole queue.
  if (now() >= deadline) return result
  const job = await db.claim()
  if (!job) return result
  if (job.status !== 'processing' || !job.claim_token)
    throw new Error('Invalid export claim')
  let current = job
  let failed = true
  try {
    while (now() < deadline && current.status === 'processing') {
      const rows = await db.batch(current)
      const content = formatExportPart(current, rows)
      // The path and content are deterministic: a lost upload/checkpoint response is safe to repeat.
      await storage.upload(
        `${current.user_id}/${current.id}/${current.next_part}.part`,
        content,
      )
      const advanced = await db.advance(current)
      if (
        advanced.id !== current.id ||
        advanced.claim_token !== current.claim_token ||
        advanced.next_part !== current.next_part + 1 ||
        advanced.status !==
          (advanced.next_part === current.part_count ? 'ready' : 'processing')
      )
        throw new Error('Invalid export checkpoint result')
      current = advanced
      result.parts++
      if (current.status === 'ready') result.ready++
    }
    failed = false
  } finally {
    if (current.status === 'processing') await db.release(current, failed)
  }
  return result
}
