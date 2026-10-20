import { z } from 'zod'

const optionalString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
)

const monitoringFlag = z.enum(['true', 'false']).default('false')
const sampleRate = (fallback: number) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().min(0).max(1).default(fallback),
  )

export const monitoringEnvSchema = z
  .object({
    NEXT_PUBLIC_APP_ENV: z.enum(['production', 'qa', 'development']).optional(),
    NEXT_PUBLIC_APP_RELEASE: z.string().min(1).max(120).optional(),
    NEXT_PUBLIC_DEPLOYMENT_KIND: z
      .enum(['production', 'qa', 'preview', 'development'])
      .optional(),
    NEXT_PUBLIC_OBSERVABILITY_ENABLED: monitoringFlag,
    NEXT_PUBLIC_PREVIEW_MONITORING_ENABLED: monitoringFlag,
    NEXT_PUBLIC_MONITORING_POLICY_APPROVED: monitoringFlag,
    NEXT_PUBLIC_CLARITY_ENABLED: monitoringFlag,
    NEXT_PUBLIC_REPLAY_ENABLED: monitoringFlag,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: sampleRate(0.05),
    NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE: sampleRate(0.01),
    NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE: sampleRate(0.25),
    NEXT_PUBLIC_SENTRY_DSN: optionalString,
    NEXT_PUBLIC_CLARITY_PROJECT_ID: z
      .string()
      .regex(/^[a-zA-Z0-9]+$/)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.NEXT_PUBLIC_OBSERVABILITY_ENABLED !== 'true') return
    for (const key of [
      'NEXT_PUBLIC_APP_ENV',
      'NEXT_PUBLIC_APP_RELEASE',
    ] as const) {
      if (!value[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Required when monitoring is enabled',
        })
      }
    }
    if (
      value.NEXT_PUBLIC_DEPLOYMENT_KIND === 'preview' &&
      value.NEXT_PUBLIC_APP_ENV === 'production'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_APP_ENV'],
        message: 'Previews must not use production telemetry',
      })
    }
  })

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  NEXT_PUBLIC_RAZORPAY_KEY_ID: optionalString,
  NEXT_PUBLIC_SENTRY_DSN: optionalString,
  NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER: optionalString,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: optionalString,
})

export const openAiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
})

export const razorpayEnvSchema = z.object({
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
})

export const supabaseAdminEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export function envError(scope: string, error: z.ZodError) {
  return new Error(
    `Invalid ${scope} environment variables:\n${z.prettifyError(error)}`,
  )
}
