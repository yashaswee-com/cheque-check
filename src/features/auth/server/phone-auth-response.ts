import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import type { PhoneAuthFailure } from '@/features/auth/phone-auth.types'

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** Serialises a phone-auth result without logging numbers, codes or tokens. */
export function phoneAuthResponse<T extends { ok: boolean }>(
  result: T | PhoneAuthFailure,
  operation: string,
) {
  if (result.ok) {
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  const failed = result as PhoneAuthFailure
  logger.warn('Phone auth request rejected', {
    operation,
    code: failed.code,
    status: failed.status,
  })
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (failed.retryAfterSeconds) {
    headers['Retry-After'] = String(failed.retryAfterSeconds)
  }
  return NextResponse.json(failed, { status: failed.status, headers })
}
