import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import type { Database } from '@/types/database.types'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  createSignedUrl: vi.fn(),
  processImage: vi.fn(),
  getOpenAiEnv: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
  }),
}))
vi.mock('@/features/cheques/services/ocr.service', () => ({
  OpenAiOcrProvider: class {
    processImage = mocks.processImage
  },
}))
vi.mock('@/lib/env/server', () => ({ getOpenAiEnv: mocks.getOpenAiEnv }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: mocks.error },
}))
vi.mock('@/lib/monitoring/server', () => ({
  setRequestUser: vi.fn(),
  withMonitoringRequest: (
    _request: Request,
    _operation: string,
    callback: () => Promise<Response>,
  ) => callback(),
}))

const details = {
  amount: 10,
  cheque_number: '000001',
  cheque_date: '2026-10-01',
  payee_name: null,
  account_number: null,
  account_name: null,
  ifsc_code: null,
  bank_name: null,
}
const request = (body: unknown) =>
  new Request('https://app.test/api/ocr/cheque', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mocks.rpc.mockResolvedValue({ data: true, error: null })
  mocks.processImage.mockResolvedValue(details)
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://app.test/signed' },
    error: null,
  })
})

describe('OCR shared contracts and client', () => {
  it.each(['consume_api_rate_limit', 'consume_user_quota'])(
    'logs %s failures and does not invoke OCR',
    async (endpoint) => {
      const error = new Error('database offline')
      mocks.rpc.mockImplementation(async (name: string) =>
        name === endpoint ? { data: null, error } : { data: true, error: null },
      )
      const response = await POST(
        request({ imageUrl: 'https://app.test/image.png' }),
      )
      expect(response.status).toBe(500)
      expect(mocks.error).toHaveBeenCalledWith('[OcrController Error]', error)
      expect(mocks.processImage).not.toHaveBeenCalled()
    },
  )

  it.each([null, {}])(
    'rejects an unsigned private image even without a storage error: %j',
    async (data) => {
      mocks.createSignedUrl.mockResolvedValueOnce({ data, error: null })
      expect(
        (
          await POST(
            request({
              imageUrl: buildPrivateMediaUrl(
                PRIVATE_CHEQUE_BUCKET,
                'u1/missing.png',
              ),
            }),
          )
        ).status,
      ).toBe(404)
      expect(mocks.processImage).not.toHaveBeenCalled()
    },
  )
  it('rejects invalid JSON before authentication', async () => {
    const response = await POST(
      new Request('https://app.test/api/ocr/cheque', {
        method: 'POST',
        body: '{broken',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body.' })
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('maps a missing signed private image to not found', async () => {
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: new Error('missing'),
    })
    const response = await POST(
      request({
        imageUrl: buildPrivateMediaUrl(PRIVATE_CHEQUE_BUCKET, 'u1/missing.png'),
      }),
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Cheque image not found.' })
    expect(mocks.processImage).not.toHaveBeenCalled()
  })
  it('keeps the typed quota arguments aligned with the committed migration', () => {
    const args: Database['public']['Functions']['consume_user_quota']['Args'] =
      {
        requested_feature: 'ai_scan',
      }
    const sql = readFileSync(
      resolve(
        'supabase',
        'migrations',
        '20260924040000_add_api_limits_and_atomic_quota.sql',
      ),
      'utf8',
    )
    expect(sql).toMatch(
      /FUNCTION consume_user_quota\(requested_feature feature_type\)/,
    )
    expect(args).toEqual({ requested_feature: 'ai_scan' })
  })

  it('passes the shared response contract through unchanged after rate and quota checks', async () => {
    const response = await POST(
      request({ imageUrl: 'https://app.test/image.png' }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(details)
    expect(mocks.rpc.mock.calls).toEqual([
      [
        'consume_api_rate_limit',
        {
          requested_endpoint: 'ocr-cheque',
          request_limit: 10,
          window_seconds: 60,
        },
      ],
      ['consume_user_quota', { requested_feature: 'ai_scan' }],
    ])
    expect(mocks.processImage).toHaveBeenCalledWith(
      'https://app.test/image.png',
    )
  })

  it.each([{}, { imageUrl: 'invalid' }, { imageUrl: 123 }])(
    'rejects malformed input before auth or provider access: %j',
    async (body) => {
      const response = await POST(request(body))
      expect(response.status).toBe(400)
      expect(mocks.getUser).not.toHaveBeenCalled()
      expect(mocks.processImage).not.toHaveBeenCalled()
    },
  )

  it('retains the unauthorized response', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(
      (await POST(request({ imageUrl: 'https://app.test/image.png' }))).status,
    ).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('retains rate-limit responses and does not consume quota', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null })
    const response = await POST(
      request({ imageUrl: 'https://app.test/image.png' }),
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(mocks.rpc).toHaveBeenCalledOnce()
    expect(mocks.processImage).not.toHaveBeenCalled()
  })

  it('retains exhausted-quota responses and does not invoke the provider', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    expect(
      (await POST(request({ imageUrl: 'https://app.test/image.png' }))).status,
    ).toBe(402)
    expect(mocks.processImage).not.toHaveBeenCalled()
  })

  it('signs owned private media before provider access', async () => {
    const imageUrl = buildPrivateMediaUrl(
      PRIVATE_CHEQUE_BUCKET,
      'u1/cheque.png',
    )
    expect((await POST(request({ imageUrl }))).status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('u1/cheque.png', 300)
    expect(mocks.processImage).toHaveBeenCalledWith('https://app.test/signed')
  })

  it('retains rejection of another user private media', async () => {
    const imageUrl = buildPrivateMediaUrl(
      PRIVATE_CHEQUE_BUCKET,
      'other/cheque.png',
    )
    expect((await POST(request({ imageUrl }))).status).toBe(403)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    expect(mocks.processImage).not.toHaveBeenCalled()
  })

  it('reports provider errors explicitly', async () => {
    mocks.processImage.mockRejectedValue(new Error('Provider unavailable'))
    const response = await POST(
      request({ imageUrl: 'https://app.test/image.png' }),
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'An unexpected error occurred during image processing.',
    })
    expect(mocks.error).toHaveBeenCalledOnce()
  })
})
