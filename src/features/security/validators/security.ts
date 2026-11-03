import { z } from 'zod'
export const pinSchema = z.string().regex(/^\d{6}$/)
export const PIN_LOCK_TIMEOUTS = [60, 300, 900, 3600] as const
export const DEFAULT_PIN_LOCK_TIMEOUT = 60
export type PinLockTimeout = (typeof PIN_LOCK_TIMEOUTS)[number]
export const pinLockTimeoutSchema = z.union(
  PIN_LOCK_TIMEOUTS.map((seconds) => z.literal(seconds)) as [
    z.ZodLiteral<60>,
    z.ZodLiteral<300>,
    z.ZodLiteral<900>,
    z.ZodLiteral<3600>,
  ],
)
export const securityStatusSchema = z.object({
  enabled: z.boolean(),
  blocked: z.boolean(),
  revision: z.string().uuid().nullable(),
  emailOtp: z.boolean(),
  phoneOtp: z.boolean(),
  lockTimeoutSeconds: pinLockTimeoutSchema.default(DEFAULT_PIN_LOCK_TIMEOUT),
})
export type SecurityStatus = z.infer<typeof securityStatusSchema>
export const pinResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unlocked'), revision: z.string().uuid() }),
  z.object({
    status: z.literal('incorrect'),
    remaining: z.number().int().min(1).max(4),
  }),
  z.object({ status: z.literal('blocked'), remaining: z.literal(0) }),
  z.object({ status: z.literal('changed') }),
])
export type PinResult = z.infer<typeof pinResultSchema>
export const securityActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('verify'), pin: pinSchema }),
  z.object({
    action: z.literal('password'),
    password: z.string().min(1).max(1024),
  }),
  z.object({
    action: z.literal('sendOtp'),
    channel: z.enum(['email', 'phone']),
  }),
  z.object({
    action: z.literal('otp'),
    channel: z.enum(['email', 'phone']),
    token: z.string().regex(/^\d{6,10}$/),
  }),
  z.object({
    action: z.literal('set'),
    proof: z.string().regex(/^[0-9a-f]{64}$/),
    pin: pinSchema,
  }),
  z.object({
    action: z.literal('remove'),
    proof: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({ action: z.literal('timeout'), seconds: pinLockTimeoutSchema }),
])
export type SecurityAction = z.infer<typeof securityActionSchema>
export const proofResponseSchema = z.object({
  proof: z.string().regex(/^[0-9a-f]{64}$/),
})
export const sentResponseSchema = z.object({ sent: z.literal(true) })
export const savedResponseSchema = z.object({ saved: z.literal(true) })
export const errorResponseSchema = z.object({ error: z.string() })
