import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPrivateMediaUrl, PRIVATE_CHEQUE_BUCKET } from '@/lib/storage'
import type { ChequeDetails, IOcrProvider } from '@/types/ocr'
import {
  executeOcrWorkflow,
  type OcrWorkflowDependencies,
} from './ocr-workflow'

const details: ChequeDetails = {
  amount: 10,
  cheque_number: '000001',
  cheque_date: '2026-10-01',
  payee_name: null,
  account_number: null,
  account_name: null,
  ifsc_code: null,
  bank_name: null,
}

const dependencies = {
  consumeRateLimit: vi.fn(),
  createSignedUrl: vi.fn(),
  consumeQuota: vi.fn(),
  ensureProviderConfigured: vi.fn(),
  provider: { processImage: vi.fn() } satisfies IOcrProvider,
} satisfies OcrWorkflowDependencies

beforeEach(() => {
  vi.resetAllMocks()
  dependencies.consumeRateLimit.mockResolvedValue(true)
  dependencies.createSignedUrl.mockResolvedValue('https://app.test/signed')
  dependencies.consumeQuota.mockResolvedValue(true)
  dependencies.provider.processImage.mockResolvedValue(details)
})

describe('executeOcrWorkflow', () => {
  it('uses the configured provider only after rate and quota checks', async () => {
    await expect(
      executeOcrWorkflow('https://app.test/image.png', 'u1', dependencies),
    ).resolves.toEqual({ kind: 'success', details })
    expect(dependencies.ensureProviderConfigured).toHaveBeenCalledOnce()
    expect(dependencies.consumeRateLimit).toHaveBeenCalledOnce()
    expect(dependencies.consumeQuota).toHaveBeenCalledOnce()
    expect(dependencies.provider.processImage).toHaveBeenCalledWith(
      'https://app.test/image.png',
    )
  })

  it('stops before quota when rate limited', async () => {
    dependencies.consumeRateLimit.mockResolvedValue(false)
    await expect(
      executeOcrWorkflow('https://app.test/image.png', 'u1', dependencies),
    ).resolves.toEqual({ kind: 'rate-limited' })
    expect(dependencies.createSignedUrl).not.toHaveBeenCalled()
    expect(dependencies.consumeQuota).not.toHaveBeenCalled()
    expect(dependencies.provider.processImage).not.toHaveBeenCalled()
  })

  it('rejects private images owned by a different user', async () => {
    const imageUrl = buildPrivateMediaUrl(
      PRIVATE_CHEQUE_BUCKET,
      'other/cheque.png',
    )
    await expect(
      executeOcrWorkflow(imageUrl, 'u1', dependencies),
    ).resolves.toEqual({ kind: 'forbidden-image' })
    expect(dependencies.createSignedUrl).not.toHaveBeenCalled()
    expect(dependencies.consumeQuota).not.toHaveBeenCalled()
  })

  it('signs the owned private image before quota and provider access', async () => {
    const imageUrl = buildPrivateMediaUrl(
      PRIVATE_CHEQUE_BUCKET,
      'u1/cheque.png',
    )
    await expect(
      executeOcrWorkflow(imageUrl, 'u1', dependencies),
    ).resolves.toEqual({ kind: 'success', details })
    expect(dependencies.createSignedUrl).toHaveBeenCalledWith(
      PRIVATE_CHEQUE_BUCKET,
      'u1/cheque.png',
      300,
    )
    expect(dependencies.provider.processImage).toHaveBeenCalledWith(
      'https://app.test/signed',
    )
  })

  it('returns image-not-found when signing does not produce a URL', async () => {
    dependencies.createSignedUrl.mockResolvedValue(null)
    const imageUrl = buildPrivateMediaUrl(
      PRIVATE_CHEQUE_BUCKET,
      'u1/cheque.png',
    )
    await expect(
      executeOcrWorkflow(imageUrl, 'u1', dependencies),
    ).resolves.toEqual({ kind: 'image-not-found' })
    expect(dependencies.consumeQuota).not.toHaveBeenCalled()
  })

  it('does not invoke the provider when quota is exhausted', async () => {
    dependencies.consumeQuota.mockResolvedValue(false)
    await expect(
      executeOcrWorkflow('https://app.test/image.png', 'u1', dependencies),
    ).resolves.toEqual({ kind: 'quota-exhausted' })
    expect(dependencies.provider.processImage).not.toHaveBeenCalled()
  })

  it('propagates dependency failures to the route error handler', async () => {
    dependencies.consumeQuota.mockRejectedValue(new Error('quota unavailable'))
    await expect(
      executeOcrWorkflow('https://app.test/image.png', 'u1', dependencies),
    ).rejects.toThrow('quota unavailable')
  })
})
