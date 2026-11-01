// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  formatExportPart,
  runExportWorker,
  type ExportJob,
  type ExportRow,
} from '../../supabase/functions/report-exports/worker'

const job: ExportJob = {
  id: 'job',
  user_id: 'owner',
  format: 'json',
  status: 'processing',
  row_count: 1001,
  part_count: 3,
  next_part: 0,
  claim_token: 'token',
}
const rows: ExportRow[] = Array.from({ length: 1001 }, (_, position) => ({
  position,
  payload: {
    cheque_number: `000${position}`,
    amount: position,
    cheque_date: '2026-03-04',
    party: { name: 'a,"b"\nline' },
    notes: '=HYPERLINK("x")',
  },
}))
describe('bounded deterministic export worker', () => {
  it('concatenates every JSON row exactly once across 500-row boundaries', () => {
    const text = [0, 1, 2]
      .map((next_part) =>
        formatExportPart(
          { ...job, next_part },
          rows.slice(next_part * 500, (next_part + 1) * 500),
        ),
      )
      .join('')
    expect(JSON.parse(text)).toEqual(rows.map((row) => row.payload))
  })
  it('escapes CSV quotes/newlines and neutralizes spreadsheet formulas while retaining numeric amounts', () => {
    const content = formatExportPart(
      { ...job, format: 'csv', row_count: 1, part_count: 1 },
      rows.slice(0, 1),
    )
    expect(content).toContain('"a,""b""\nline"')
    expect(content).toContain(`"'=HYPERLINK(""x"")"`)
    expect(content).toContain('"0000"')
    expect(content).toContain('"0"')
  })
  it('keeps export dates ISO-formatted and cheque amounts numeric without applying display preferences', () => {
    const csv = formatExportPart(
      { ...job, format: 'csv', row_count: 1, part_count: 1 },
      rows.slice(0, 1),
    )
    const json = formatExportPart(
      { ...job, row_count: 1, part_count: 1 },
      rows.slice(0, 1),
    )

    expect(csv).toContain('"2026-03-04"')
    expect(csv).toContain('"0"')
    expect(csv).not.toContain('₹')
    expect(JSON.parse(json)[0]).toMatchObject({
      amount: 0,
      cheque_date: '2026-03-04',
    })
  })
  it('rejects missing, out-of-order or duplicate snapshot rows rather than producing partial exports', () => {
    expect(() => formatExportPart(job, [])).toThrow('Invalid export snapshot')
    expect(() =>
      formatExportPart(
        job,
        Array.from({ length: 500 }, () => rows[0]),
      ),
    ).toThrow('Invalid export snapshot')
  })
  function fixture() {
    let next = 0
    const db = {
      claim: vi.fn(async () => ({ ...job, next_part: next })),
      batch: vi.fn(async (j: ExportJob) =>
        rows.slice(j.next_part * 500, (j.next_part + 1) * 500),
      ),
      advance: vi.fn(async () => {
        next++
        return {
          ...job,
          next_part: next,
          status: next === 3 ? 'ready' : 'processing',
        }
      }),
      release: vi.fn(async () => {}),
      expired: vi.fn(async () => [] as ExportJob[]),
      cleaned: vi.fn(async () => {}),
    }
    const storage = {
      upload: vi.fn(async (_path: string, _content: string) => {}),
      removeJob: vi.fn(async (_prefix: string) => {}),
    }
    return { db, storage }
  }
  it('uploads before checkpointing and finishes without releasing a ready claim', async () => {
    const { db, storage } = fixture()
    expect(await runExportWorker(db, storage, () => 0)).toEqual({
      parts: 3,
      ready: 1,
      cleaned: 0,
    })
    expect(storage.upload.mock.calls.map(([path]) => path)).toEqual([
      'owner/job/0.part',
      'owner/job/1.part',
      'owner/job/2.part',
    ])
    expect(db.release).not.toHaveBeenCalled()
  })
  it('releases failures for bounded retries and never advances a failed upload', async () => {
    const { db, storage } = fixture()
    storage.upload.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(runExportWorker(db, storage, () => 0)).rejects.toThrow(
      'Storage unavailable',
    )
    expect(db.advance).not.toHaveBeenCalled()
    expect(db.release).toHaveBeenCalledWith(job, true)
  })
  it('repeats identical bytes when an upload succeeds but its checkpoint response is lost', async () => {
    const { db, storage } = fixture()
    db.advance.mockRejectedValueOnce(new Error('Checkpoint response lost'))
    await expect(runExportWorker(db, storage, () => 0)).rejects.toThrow(
      'Checkpoint response lost',
    )
    await runExportWorker(db, storage, () => 0)
    expect(storage.upload.mock.calls[0]).toEqual(storage.upload.mock.calls[1])
  })
  it('resumes from a committed cursor after a healthy time-budget pause', async () => {
    const { db, storage } = fixture()
    let clock = 0
    storage.upload.mockImplementation(async () => {
      clock += 40000
    })
    expect(await runExportWorker(db, storage, () => clock)).toEqual({
      parts: 1,
      ready: 0,
      cleaned: 0,
    })
    expect(db.release).toHaveBeenCalledWith(
      expect.objectContaining({ next_part: 1 }),
      false,
    )
    await runExportWorker(db, storage, () => clock)
    expect(storage.upload.mock.calls[1][0]).toBe('owner/job/1.part')
  })
  it('does not mark cleanup complete until storage deletion succeeds', async () => {
    const { db, storage } = fixture()
    db.expired.mockResolvedValueOnce([job])
    storage.removeJob.mockRejectedValueOnce(new Error('Removal failed'))
    await expect(runExportWorker(db, storage)).rejects.toThrow('Removal failed')
    expect(db.cleaned).not.toHaveBeenCalled()
    expect(db.claim).not.toHaveBeenCalled()
  })
})
