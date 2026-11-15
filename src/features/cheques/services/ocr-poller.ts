import { scanRequest, ScanRequestError } from './scan-client'
import {
  isScanPending,
  ScanJobSchema,
  type ScanJob,
} from '@/validators/cheque-scan'

interface PollOptions {
  signal: AbortSignal
  isCurrent: (job: ScanJob) => boolean
  onJob?: (job: ScanJob) => void
  intervalMs?: number
}

function waitForInterval(ms: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }

    const finish = (elapsed: boolean) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      resolve(elapsed)
    }
    const onAbort = () => finish(false)
    const timeout = setTimeout(() => finish(true), ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollScanJob(
  initial: ScanJob,
  { signal, isCurrent, onJob, intervalMs = 600 }: PollOptions,
): Promise<ScanJob | null> {
  let latest = initial

  while (isScanPending(latest) && !signal.aborted && isCurrent(latest)) {
    if (!(await waitForInterval(intervalMs, signal))) return null
    if (signal.aborted || !isCurrent(latest)) return null

    let read: ScanJob | null
    try {
      read = await scanRequest(
        { action: 'read', imageUrl: latest.image_url },
        ScanJobSchema.nullable(),
        signal,
      )
    } catch (error) {
      if (signal.aborted) return null
      throw error
    }

    if (!read) throw new ScanRequestError('IMAGE_NOT_FOUND')
    if (signal.aborted || !isCurrent(read)) return null
    latest = read
    onJob?.(latest)
  }

  return signal.aborted || !isCurrent(latest) ? null : latest
}
