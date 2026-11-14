import type { z } from 'zod'
import { monitoredFetch } from '@/lib/monitoring/telemetry'
import { ScanActionSchema, ScanEnvelopeSchema } from '@/validators/cheque-scan'

export class ScanRequestError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

export async function scanRequest<T>(
  action: z.input<typeof ScanActionSchema>,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await monitoredFetch('/api/ocr/cheque', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
    signal: signal ?? AbortSignal.timeout(10_000),
  })
  const body: unknown = await response.json()
  const envelope = ScanEnvelopeSchema.parse(body)
  if (!response.ok)
    throw new ScanRequestError(envelope.code ?? 'SCAN_UNAVAILABLE')
  return schema.parse(envelope.data)
}
