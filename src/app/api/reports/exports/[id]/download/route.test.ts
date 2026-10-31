// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { GET } from './route'
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  bucket: vi.fn(),
  download: vi.fn(),
  stream: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }))
vi.mock('@/lib/logger', () => ({ logger: { error: mocks.error } }))
const id = '33333333-3333-4333-8333-333333333333'
const job = {
  id,
  user_id: '11111111-1111-4111-8111-111111111111',
  format: 'json',
  status: 'ready',
  row_count: 501,
  part_count: 2,
  next_part: 2,
  created_at: '2026-10-31',
  expires_at: '2026-11-01',
  error_code: null,
}
const request = () =>
  new Request('https://app.test/api/reports/exports/download')
const params = (value = id) => ({ params: Promise.resolve({ id: value }) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.client.mockResolvedValue({
    auth: { getUser: mocks.user },
    rpc: mocks.rpc,
    storage: { from: mocks.bucket },
  })
  mocks.user.mockResolvedValue({
    data: { user: { id: job.user_id } },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: job, error: null })
  mocks.bucket.mockReturnValue({ download: mocks.download })
  mocks.download.mockReturnValue({ asStream: mocks.stream })
  mocks.stream
    .mockResolvedValueOnce({
      data: new Blob(['[{"amount":1}']).stream(),
      error: null,
    })
    .mockResolvedValueOnce({
      data: new Blob([',{"amount":2}]']).stream(),
      error: null,
    })
})
describe('private export download stream', () => {
  it('sets CSV content type and filename while preserving streamed bytes', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ...job,
        format: 'csv',
        row_count: 1,
        part_count: 1,
        next_part: 1,
      },
      error: null,
    })
    mocks.stream.mockReset().mockResolvedValue({
      data: new Blob(['amount\r\n1\r\n']).stream(),
      error: null,
    })
    const response = await GET(request(), params())
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toContain(
      `cheques-${id}.csv`,
    )
    expect(await response.text()).toBe('amount\r\n1\r\n')
  })
  it.each([
    { data: null, error: null },
    { data: null, error: { code: 'XX000' } },
  ])(
    'reports unavailable authorization metadata as a server failure: %j',
    async (result) => {
      mocks.rpc.mockResolvedValue(result)
      expect((await GET(request(), params())).status).toBe(500)
      expect(mocks.download).not.toHaveBeenCalled()
      if (result.error)
        expect(mocks.error).toHaveBeenCalledWith(
          'Export download authorization failed',
          result.error,
        )
      else expect(mocks.error).not.toHaveBeenCalled()
    },
  )

  it('rejects valid metadata for an export that is not ready', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...job, status: 'queued' },
      error: null,
    })
    expect((await GET(request(), params())).status).toBe(500)
    expect(mocks.error).toHaveBeenCalledWith(
      'Invalid export download metadata',
      undefined,
    )
  })

  it('rejects a missing part even when storage returns no error', async () => {
    mocks.stream.mockReset().mockResolvedValue({ data: null, error: null })
    const response = await GET(request(), params())
    await expect(response.text()).rejects.toThrow('Export part missing')
  })

  it('rejects non-byte stream chunks instead of returning a malformed attachment', async () => {
    mocks.stream.mockReset().mockResolvedValue({
      data: new ReadableStream<unknown>({
        start(controller) {
          controller.enqueue('not bytes')
        },
      }),
      error: null,
    })
    const response = await GET(request(), params())
    await expect(response.text()).rejects.toThrow('Invalid export stream chunk')
  })

  it('cancels a storage stream arriving after the client disconnected', async () => {
    let resolvePart!: (value: {
      data: ReadableStream<Uint8Array>
      error: null
    }) => void
    const upstreamCancel = vi.fn()
    mocks.stream.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolvePart = resolve
      }),
    )
    const response = await GET(request(), params())
    await vi.waitFor(() => expect(mocks.stream).toHaveBeenCalledOnce())
    await response.body!.cancel('client disconnected')
    resolvePart({
      data: new ReadableStream<Uint8Array>({ cancel: upstreamCancel }),
      error: null,
    })
    await vi.waitFor(() => expect(upstreamCancel).toHaveBeenCalledOnce())
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('does not log a late upstream failure after the client cancelled', async () => {
    let rejectPart!: (reason: Error) => void
    mocks.stream.mockReset().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectPart = reject
      }),
    )
    const response = await GET(request(), params())
    await vi.waitFor(() => expect(mocks.stream).toHaveBeenCalledOnce())
    await response.body!.cancel('client disconnected')
    rejectPart(new Error('late storage failure'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('cancels an active pending read without enqueuing a chunk after disconnect', async () => {
    const upstreamCancel = vi.fn()
    const upstream = new ReadableStream<Uint8Array>({ cancel: upstreamCancel })
    mocks.stream.mockReset().mockResolvedValue({ data: upstream, error: null })
    const response = await GET(request(), params())
    const reader = response.body!.getReader()
    const pendingRead = reader.read()
    await vi.waitFor(() => expect(upstream.locked).toBe(true))
    await reader.cancel('client disconnected')
    expect(await pendingRead).toEqual({ done: true, value: undefined })
    expect(upstreamCancel).toHaveBeenCalledWith('client disconnected')
    expect(mocks.error).not.toHaveBeenCalled()
  })
  it('rejects malformed IDs before authentication', async () => {
    expect((await GET(request(), params('../bad'))).status).toBe(400)
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it('requires authentication', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(request(), params())).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['expired', 'premium revoked', 'business deleted', 'foreign owner'])(
    'rejects %s without accessing storage',
    async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
      expect((await GET(request(), params())).status).toBe(403)
      expect(mocks.download).not.toHaveBeenCalled()
    },
  )
  it('concatenates private parts in order and returns an attachment with no caching', async () => {
    const response = await GET(request(), params())
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Content-Disposition')).toContain(
      `cheques-${id}.json`,
    )
    expect(await response.json()).toEqual([{ amount: 1 }, { amount: 2 }])
    expect(mocks.rpc).toHaveBeenCalledWith('report_export_download', {
      requested_job: id,
    })
    expect(mocks.download.mock.calls.map(([path]) => path)).toEqual([
      `${job.user_id}/${id}/0.part`,
      `${job.user_id}/${id}/1.part`,
    ])
    expect(mocks.download.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    )
  })
  it('surfaces missing parts and does not return success-shaped partial JSON', async () => {
    mocks.stream
      .mockReset()
      .mockResolvedValue({ data: null, error: new Error('Part missing') })
    const response = await GET(request(), params())
    await expect(response.text()).rejects.toThrow('Part missing')
    expect(mocks.error).toHaveBeenCalledWith(
      'Export download stream failed',
      expect.any(Error),
    )
  })
  it('guards invalid metadata before starting a stream', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ...job, part_count: 999 },
      error: null,
    })
    expect((await GET(request(), params())).status).toBe(500)
    expect(mocks.download).not.toHaveBeenCalled()
  })
  it('aborts the upstream stream when a client cancels its download', async () => {
    let cancel!: () => void
    const cancelled = new Promise<void>((resolve) => {
      cancel = resolve
    })
    mocks.stream.mockReset().mockResolvedValue({
      data: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('partial'))
        },
        cancel() {
          cancel()
        },
      }),
      error: null,
    })
    const response = await GET(request(), params())
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    await cancelled
    expect(mocks.download.mock.calls[0][2].signal.aborted).toBe(true)
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
