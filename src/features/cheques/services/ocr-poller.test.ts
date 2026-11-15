import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ScanJob } from '@/validators/cheque-scan'
import { pollScanJob } from './ocr-poller'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  ScanRequestError: class ScanRequestError extends Error {
    constructor(public readonly code: string) {
      super(code)
    }
  },
}))
vi.mock('./scan-client', () => ({
  scanRequest: mocks.request,
  ScanRequestError: mocks.ScanRequestError,
}))

const job = (status: ScanJob['status']): ScanJob =>
  ({
    id: 'job',
    business_id: 'business',
    image_url: '/image.jpg',
    mode: 'Inward',
    status,
  }) as ScanJob

afterEach(() => {
  vi.clearAllMocks()
})

describe('OCR polling client', () => {
  it('polls until a terminal server state and reports each observed job', async () => {
    const pending = job('processing')
    const ready = job('ready_partial')
    mocks.request.mockResolvedValueOnce(ready)
    const onJob = vi.fn()

    await expect(
      pollScanJob(pending, {
        signal: new AbortController().signal,
        isCurrent: () => true,
        onJob,
        intervalMs: 0,
      }),
    ).resolves.toBe(ready)

    expect(mocks.request).toHaveBeenCalledOnce()
    expect(mocks.request.mock.calls[0][2]).toBeInstanceOf(AbortSignal)
    expect(onJob).toHaveBeenCalledWith(ready)
  })

  it('cancels the polling delay without sending another read request', async () => {
    const controller = new AbortController()
    const pending = pollScanJob(job('accepted'), {
      signal: controller.signal,
      isCurrent: () => true,
      intervalMs: 30_000,
    })

    controller.abort()

    await expect(pending).resolves.toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('passes cancellation through to an in-flight read request', async () => {
    const controller = new AbortController()
    mocks.request.mockImplementation(
      (_action: unknown, _schema: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const polling = pollScanJob(job('processing'), {
      signal: controller.signal,
      isCurrent: () => true,
      intervalMs: 0,
    })

    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    controller.abort()

    await expect(polling).resolves.toBeNull()
    expect(mocks.request.mock.calls[0][2]).toBe(controller.signal)
  })

  it('stops when the generation guard rejects a result', async () => {
    const pending = job('processing')
    await expect(
      pollScanJob(pending, {
        signal: new AbortController().signal,
        isCurrent: () => false,
        intervalMs: 0,
      }),
    ).resolves.toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
