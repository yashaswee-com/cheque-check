import {
  securityStatusSchema,
  pinResultSchema,
  proofResponseSchema,
  sentResponseSchema,
  savedResponseSchema,
  errorResponseSchema,
  type PinLockTimeout,
} from '../validators/security'
import { SecurityError, type SecurityAction } from '../types'
import { logger } from '@/lib/logger'
import { ServiceUnavailableError } from '@/lib/errors'
async function request<T>(
  schema: { parse: (data: unknown) => T },
  action?: SecurityAction,
): Promise<T> {
  try {
    let response: Response
    try {
      response = await fetch('/api/security/pin', {
        method: action ? 'POST' : 'GET',
        cache: 'no-store',
        ...(action
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action),
            }
          : {}),
      })
    } catch (error) {
      throw new ServiceUnavailableError(
        'App security request unavailable',
        error,
      )
    }
    let data: unknown
    try {
      data = await response.json()
    } catch (error) {
      if (!response.ok)
        throw new ServiceUnavailableError(
          `App security request failed with status ${response.status}`,
          error,
        )
      throw error
    }
    if (!response.ok) {
      const error = errorResponseSchema.parse(data)
      throw new SecurityError(error.error)
    }
    return schema.parse(data)
  } catch (error) {
    if (error instanceof SecurityError) throw error
    logger.error('App security service unavailable', error)
    throw new SecurityError('unavailable')
  }
}
export const securityRepository = {
  status: () => request(securityStatusSchema),
  verify: (pin: string) => request(pinResultSchema, { action: 'verify', pin }),
  password: (password: string, captchaToken?: string) =>
    request(proofResponseSchema, {
      action: 'password',
      password,
      captchaToken,
    }),
  sendOtp: (channel: 'email' | 'phone', captchaToken?: string) =>
    request(sentResponseSchema, { action: 'sendOtp', channel, captchaToken }),
  otp: (channel: 'email' | 'phone', token: string) =>
    request(proofResponseSchema, { action: 'otp', channel, token }),
  set: (proof: string, pin: string) =>
    request(savedResponseSchema, { action: 'set', proof, pin }),
  remove: (proof: string) =>
    request(savedResponseSchema, { action: 'remove', proof }),
  timeout: (seconds: PinLockTimeout) =>
    request(savedResponseSchema, { action: 'timeout', seconds }),
}
