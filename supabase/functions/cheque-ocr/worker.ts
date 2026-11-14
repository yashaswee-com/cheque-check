import {
  imageMediaType,
  isRecord,
  OCR_OUTPUT_JSON_SCHEMA,
  OCR_SYSTEM_PROMPT,
  validateOcrOutput,
} from './contract.ts'

export interface ScanClaim {
  id: string
  image_url: string
  deadline_at: string
  claim_token: string
  model: string
  auto_charge_enabled: boolean
}

export interface ScanWorkerDependencies {
  now(): number
  claim(id: string): Promise<ScanClaim | null>
  active(job: ScanClaim): Promise<boolean>
  image(job: ScanClaim, signal: AbortSignal): Promise<Uint8Array>
  infer(
    job: ScanClaim,
    bytes: Uint8Array,
    mediaType: string,
    signal: AbortSignal,
  ): Promise<unknown>
  finish(
    job: ScanClaim,
    result: {
      status: string
      details?: ReturnType<typeof validateOcrOutput>['details']
      reliability?: ReturnType<typeof validateOcrOutput>['reliability']
      error?: string
    },
  ): Promise<void>
}

export class OcrProviderError extends Error {
  constructor(
    public readonly retryable: boolean,
    public readonly retryAfterMs = 0,
  ) {
    super('PROVIDER_UNAVAILABLE')
  }
}

export function retryAfterMs(value: string | null, now = Date.now()) {
  if (value === null) return 0
  const seconds = Number(value)
  if (value.trim() && Number.isFinite(seconds))
    return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : Infinity
}

export async function runScan(
  id: string,
  dependencies: ScanWorkerDependencies,
) {
  const job = await dependencies.claim(id)
  if (!job) return
  // Leave time for the transaction; the database independently enforces the deadline.
  const remaining = Date.parse(job.deadline_at) - dependencies.now() - 300
  if (remaining <= 0) {
    await dependencies.finish(job, { status: 'timed_out', error: 'TIMED_OUT' })
    return
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), remaining)
  try {
    const bytes = await dependencies.image(job, controller.signal)
    const mediaType = validateImageBounds(bytes)
    let output: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await dependencies.active(job))) {
        await dependencies.finish(job, { status: 'failed', error: 'CANCELLED' })
        return
      }
      try {
        output = await dependencies.infer(
          job,
          bytes,
          mediaType,
          controller.signal,
        )
        break
      } catch (error) {
        const timeLeft = Date.parse(job.deadline_at) - dependencies.now() - 300
        if (
          !(error instanceof OcrProviderError) ||
          !error.retryable ||
          attempt !== 0 ||
          timeLeft < error.retryAfterMs + 2000 ||
          controller.signal.aborted
        )
          throw error
        if (error.retryAfterMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, error.retryAfterMs),
          )
        }
      }
    }
    if (controller.signal.aborted) throw new Error('TIMED_OUT')
    const result = validateOcrOutput(output, job.auto_charge_enabled)
    await dependencies.finish(job, result)
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      dependencies.now() >= Date.parse(job.deadline_at) - 300
    const code = timedOut
      ? 'TIMED_OUT'
      : error instanceof Error &&
          ['INVALID_IMAGE', 'INVALID_OUTPUT', 'IMAGE_NOT_FOUND'].includes(
            error.message,
          )
        ? error.message
        : 'PROVIDER_UNAVAILABLE'
    // Never log provider exceptions: they may contain the request image or response.
    await dependencies.finish(job, {
      status: timedOut ? 'timed_out' : 'failed',
      error: code,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function validateImageBounds(bytes: Uint8Array, maxBytes?: number) {
  const mediaType = imageMediaType(bytes, maxBytes)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0
  let height = 0
  if (mediaType === 'image/png') {
    if (
      bytes.length < 33 ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR'
    )
      throw new Error('INVALID_IMAGE')
    width = view.getUint32(16)
    height = view.getUint32(20)
    let offset = 8
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset)
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
      if (type === 'acTL') throw new Error('INVALID_IMAGE')
      if (length > bytes.length - offset - 12) throw new Error('INVALID_IMAGE')
      offset += length + 12
    }
  } else if (mediaType === 'image/jpeg') {
    let offset = 2
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) throw new Error('INVALID_IMAGE')
      const marker = bytes[offset + 1]
      if (marker === 0xda || marker === 0xd9) break
      const size = view.getUint16(offset + 2)
      if (size < 2 || offset + 2 + size > bytes.length)
        throw new Error('INVALID_IMAGE')
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = view.getUint16(offset + 5)
        width = view.getUint16(offset + 7)
        break
      }
      offset += 2 + size
    }
  } else {
    const type = String.fromCharCode(...bytes.slice(12, 16))
    if (type === 'VP8X' && bytes.length >= 30) {
      if (bytes[20] & 2) throw new Error('INVALID_IMAGE')
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    } else if (type === 'VP8 ' && bytes.length >= 30) {
      width = view.getUint16(26, true) & 0x3fff
      height = view.getUint16(28, true) & 0x3fff
    } else if (type === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const dimensions = view.getUint32(21, true)
      width = 1 + (dimensions & 0x3fff)
      height = 1 + ((dimensions >>> 14) & 0x3fff)
    }
  }
  if (
    width < 200 ||
    height < 80 ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16_000_000
  )
    throw new Error('INVALID_IMAGE')
  return mediaType
}

export async function openAiExtraction(
  key: string,
  job: ScanClaim,
  bytes: Uint8Array,
  mediaType: string,
  signal: AbortSignal,
) {
  if (
    !/^(gpt-4o(?:-mini)?|gpt-4\.1(?:-mini|-nano)?|gpt-5(?:-mini|-nano)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(
      job.model,
    )
  ) {
    throw new Error('INVALID_MODEL')
  }
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: job.model,
      max_completion_tokens: 1000,
      messages: [
        { role: 'system', content: OCR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract the visible cheque front fields.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${btoa(binary)}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'cheque_front_v2',
          strict: true,
          schema: OCR_OUTPUT_JSON_SCHEMA,
        },
      },
    }),
  })
  if (!response.ok) {
    const after = retryAfterMs(response.headers.get('Retry-After'))
    // Only definitive HTTP rejections may be automatically retried; network failures are uncertain.
    throw new OcrProviderError(
      response.status === 429 || response.status === 503,
      after,
    )
  }
  const body: unknown = await response.json()
  if (!isRecord(body) || !Array.isArray(body.choices))
    throw new Error('INVALID_OUTPUT')
  if (isRecord(body.usage)) {
    const prompt = body.usage.prompt_tokens
    const completion = body.usage.completion_tokens
    if (
      typeof prompt === 'number' &&
      Number.isSafeInteger(prompt) &&
      prompt >= 0 &&
      typeof completion === 'number' &&
      Number.isSafeInteger(completion) &&
      completion >= 0
    ) {
      console.info(
        JSON.stringify({
          event: 'ocr.provider.usage',
          prompt_tokens: prompt,
          completion_tokens: completion,
        }),
      )
    }
  }
  const choice: unknown = body.choices[0]
  if (
    !isRecord(choice) ||
    choice.finish_reason !== 'stop' ||
    !isRecord(choice.message) ||
    typeof choice.message.content !== 'string' ||
    choice.message.refusal
  )
    throw new Error('INVALID_OUTPUT')
  if (choice.message.content.length > 10_000) throw new Error('INVALID_OUTPUT')
  try {
    return JSON.parse(choice.message.content) as unknown
  } catch {
    throw new Error('INVALID_OUTPUT')
  }
}
