import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChequeDetailsSchema } from '@/validators/ocr'
import { OpenAiOcrProvider } from './ocr.service'

const mocks = vi.hoisted(() => ({
  openai: vi.fn(),
  generateObject: vi.fn(),
  getOpenAiEnv: vi.fn(),
}))
vi.mock('@ai-sdk/openai', () => ({ openai: mocks.openai }))
vi.mock('ai', () => ({ generateObject: mocks.generateObject }))
vi.mock('@/lib/env/server', () => ({ getOpenAiEnv: mocks.getOpenAiEnv }))

beforeEach(() => vi.resetAllMocks())

describe('canonical OCR provider', () => {
  it('uses the shared extraction schema and the existing default model', async () => {
    const object = {
      amount: null,
      cheque_number: null,
      cheque_date: null,
      payee_name: null,
      account_number: null,
      account_name: null,
      ifsc_code: null,
      bank_name: null,
    }
    mocks.generateObject.mockResolvedValue({ object })
    expect(
      await new OpenAiOcrProvider().processImage('https://app.test/image.png'),
    ).toBe(object)
    expect(mocks.getOpenAiEnv).toHaveBeenCalledOnce()
    expect(mocks.openai).toHaveBeenCalledWith('gpt-4o-mini')
    expect(mocks.generateObject.mock.calls[0][0].schema).toBe(
      ChequeDetailsSchema,
    )
    expect(
      mocks.generateObject.mock.calls[0][0].messages[0].content[1],
    ).toEqual({
      type: 'image',
      image: 'https://app.test/image.png',
    })
  })

  it('uses a per-request model when the route resolves one from the plan', async () => {
    mocks.generateObject.mockResolvedValue({ object: {} })
    await new OpenAiOcrProvider().processImage(
      'https://app.test/image.png',
      'gpt-4o',
    )
    expect(mocks.openai).toHaveBeenCalledWith('gpt-4o')
  })

  it('does not invoke AI when configuration is invalid', async () => {
    mocks.getOpenAiEnv.mockImplementation(() => {
      throw new Error('Missing API configuration')
    })
    await expect(
      new OpenAiOcrProvider().processImage('https://app.test/image.png'),
    ).rejects.toThrow('Missing API configuration')
    expect(mocks.generateObject).not.toHaveBeenCalled()
  })
})
