// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  validateOcrOutput,
  OCR_SYSTEM_PROMPT,
} from '../../../../supabase/functions/cheque-ocr/contract'
import {
  OcrProviderError,
  openAiExtraction,
  retryAfterMs,
  runScan,
  validateImageBounds,
  type ScanClaim,
} from '../../../../supabase/functions/cheque-ocr/worker'

const output = {
  document: 'cheque_front',
  uncertain_fields: [],
  amount: 1500.25,
  cheque_number: '001234',
  cheque_date: '2026-11-14',
  payee_name: 'Example Business',
  account_number: '000123456789',
  account_name: 'Example Drawer',
  ifsc_code: 'ABCD0ABC123',
  bank_name: 'Example Bank',
}
function png(width = 1000, height = 400) {
  const bytes = new Uint8Array(45)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  const data = new DataView(bytes.buffer)
  data.setUint32(8, 13)
  bytes.set([73, 72, 68, 82], 12)
  data.setUint32(16, width)
  data.setUint32(20, height)
  bytes.set([73, 69, 78, 68], 37)
  return bytes
}
const job: ScanClaim = {
  id: 'job',
  image_url: '/private',
  claim_token: 'token',
  model: 'gpt-4o-mini',
  deadline_at: new Date(Date.now() + 7000).toISOString(),
  auto_charge_enabled: false,
}

describe('scan extraction validation', () => {
  it('preserves leading zeros and alphanumeric IFSC; defaults to human review before calibration', () => {
    const result = validateOcrOutput(output)
    expect(result.status).toBe('ready_partial')
    expect(result.details.cheque_number).toBe('001234')
    expect(result.details.account_number).toBe('000123456789')
    expect(result.details.ifsc_code).toBe('ABCD0ABC123')
    expect(result.reliability.amount.level).toBe('needs_review')
  })
  it.each([
    ['cheque_number', '12345'],
    ['cheque_date', '2026-02-30'],
    ['account_number', 'XXXX1234'],
    ['ifsc_code', 'ABCD1234567'],
    ['amount', -10],
    ['amount', Number.POSITIVE_INFINITY],
    ['amount', 1.001],
    ['payee_name', '<script>alert(1)</script>'],
  ])('does not silently repair invalid %s', (field, value) => {
    const result = validateOcrOutput({ ...output, [field]: value })
    expect(result.details[field as keyof typeof result.details]).toBeNull()
    expect(
      result.reliability[field as keyof typeof result.reliability].level,
    ).toBe('unusable')
  })
  it('never treats all-null, non-cheques, back-only or uncertain critical output as success', () => {
    const empty = Object.fromEntries(
      Object.keys(output).map((field) => [field, null]),
    )
    expect(
      validateOcrOutput({
        ...empty,
        document: 'cheque_front',
        uncertain_fields: [],
      }).status,
    ).toBe('unusable')
    expect(
      validateOcrOutput({ ...output, document: 'unsupported' }).status,
    ).toBe('unusable')
    expect(
      validateOcrOutput({
        ...output,
        uncertain_fields: ['amount', 'cheque_number', 'cheque_date'],
      }).status,
    ).toBe('unusable')
  })
  it('rejects malformed/unbounded schema and requires explicit evaluated high-reliability enablement', () => {
    expect(() =>
      validateOcrOutput({ ...output, command: 'delete all' }),
    ).toThrow('INVALID_OUTPUT')
    expect(() => validateOcrOutput({})).toThrow('INVALID_OUTPUT')
    expect(validateOcrOutput(output, true).status).toBe('ready_high')
    expect(OCR_SYSTEM_PROMPT).toContain('UNTRUSTED DOCUMENT DATA')
    expect(OCR_SYSTEM_PROMPT).toContain('no tools')
  })
  it('bounds actual image headers/pixels rather than trusting extension', () => {
    expect(validateImageBounds(png())).toBe('image/png')
    expect(() => validateImageBounds(png(8192, 8192))).toThrow('INVALID_IMAGE')
    expect(() => validateImageBounds(new Uint8Array(50))).toThrow(
      'INVALID_IMAGE',
    )
    expect(() => validateImageBounds(png(1, 1))).toThrow('INVALID_IMAGE')
  })
})

describe('bounded worker', () => {
  function dependencies() {
    return {
      now: () => Date.now(),
      claim: vi.fn().mockResolvedValue({
        ...job,
        deadline_at: new Date(Date.now() + 7000).toISOString(),
      }),
      active: vi.fn().mockResolvedValue(true),
      image: vi.fn().mockResolvedValue(png()),
      infer: vi.fn().mockResolvedValue(output),
      finish: vi.fn().mockResolvedValue(undefined),
    }
  }
  it('commits only normalized output with no raw payload', async () => {
    const deps = dependencies()
    await runScan('job', deps)
    expect(deps.finish).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'ready_partial' }),
    )
    expect(deps.finish.mock.calls[0][1]).not.toHaveProperty('document')
  })
  it('does nothing for duplicate claims', async () => {
    const deps = dependencies()
    deps.claim.mockResolvedValue(null)
    await runScan('job', deps)
    expect(deps.infer).not.toHaveBeenCalled()
    expect(deps.finish).not.toHaveBeenCalled()
  })
  it('does not restart expired work', async () => {
    const deps = dependencies()
    deps.claim.mockResolvedValue({
      ...job,
      deadline_at: new Date(Date.now() - 1).toISOString(),
    })
    await runScan('job', deps)
    expect(deps.finish).toHaveBeenCalledWith(expect.anything(), {
      status: 'timed_out',
      error: 'TIMED_OUT',
    })
    expect(deps.infer).not.toHaveBeenCalled()
  })
  it('retries one definitive transient rejection, never uncertain network failures', async () => {
    const deps = dependencies()
    deps.infer.mockRejectedValueOnce(new OcrProviderError(true))
    await runScan('job', deps)
    expect(deps.infer).toHaveBeenCalledTimes(2)
    deps.infer
      .mockReset()
      .mockRejectedValue(new Error('secret provider payload'))
    await runScan('job', deps)
    expect(deps.infer).toHaveBeenCalledOnce()
    expect(deps.finish).toHaveBeenLastCalledWith(expect.anything(), {
      status: 'failed',
      error: 'PROVIDER_UNAVAILABLE',
    })
  })
  it('does not retry Retry-After beyond deadline or schema failures', async () => {
    const deps = dependencies()
    deps.infer.mockRejectedValueOnce(new OcrProviderError(true, 60_000))
    await runScan('job', deps)
    expect(deps.infer).toHaveBeenCalledOnce()
    deps.infer.mockReset().mockResolvedValue({})
    await runScan('job', deps)
    expect(deps.infer).toHaveBeenCalledOnce()
    expect(deps.finish).toHaveBeenLastCalledWith(expect.anything(), {
      status: 'failed',
      error: 'INVALID_OUTPUT',
    })
  })
  it('does not begin another attempt after cancellation or an emergency stop', async () => {
    const deps = dependencies()
    deps.active.mockResolvedValueOnce(true).mockResolvedValue(false)
    deps.infer.mockRejectedValueOnce(new OcrProviderError(true))
    await runScan('job', deps)
    expect(deps.infer).toHaveBeenCalledOnce()
    expect(deps.finish).toHaveBeenLastCalledWith(expect.anything(), {
      status: 'failed',
      error: 'CANCELLED',
    })
  })
  it('honors seconds and HTTP-date Retry-After without guessing malformed values', () => {
    expect(retryAfterMs('60')).toBe(60_000)
    expect(
      retryAfterMs(
        'Sat, 14 Nov 2026 08:00:00 GMT',
        Date.parse('2026-11-14T07:59:00Z'),
      ),
    ).toBe(60_000)
    expect(retryAfterMs('not a date')).toBe(Infinity)
  })
  it('aborts stalled provider work within the original budget and never commits success afterward', async () => {
    vi.useFakeTimers()
    try {
      const deps = dependencies()
      deps.infer.mockImplementation(
        (_job, _bytes, _media, signal: AbortSignal) =>
          new Promise((_, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            ),
          ),
      )
      const pending = runScan('job', deps)
      await vi.advanceTimersByTimeAsync(7000)
      await pending
      expect(deps.finish).toHaveBeenLastCalledWith(expect.anything(), {
        status: 'timed_out',
        error: 'TIMED_OUT',
      })
      expect(deps.infer).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
  it('keeps document instructions in the untrusted image and grants no model tools', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(output) },
            },
          ],
        }),
      ),
    )
    vi.stubGlobal('fetch', fetch)
    try {
      expect(
        await openAiExtraction(
          'synthetic-key',
          job,
          png(),
          'image/png',
          new AbortController().signal,
        ),
      ).toEqual(output)
      const request = JSON.parse(fetch.mock.calls[0][1].body)
      expect(request.messages[0]).toEqual({
        role: 'system',
        content: OCR_SYSTEM_PROMPT,
      })
      expect(request).not.toHaveProperty('tools')
      expect(request.response_format.json_schema.strict).toBe(true)
      expect(request.max_completion_tokens).toBe(1000)
      await expect(
        openAiExtraction(
          'synthetic-key',
          { ...job, model: 'http://untrusted-model' },
          png(),
          'image/png',
          new AbortController().signal,
        ),
      ).rejects.toThrow('INVALID_MODEL')
      expect(fetch).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
