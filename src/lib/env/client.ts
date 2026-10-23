import { envError, publicEnvSchema } from './schema'

const result = publicEnvSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_LOG_LEVEL: process.env.NEXT_PUBLIC_LOG_LEVEL,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER:
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER,
  NEXT_PUBLIC_CLARITY_PROJECT_ID: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV || undefined,
  NEXT_PUBLIC_DEPLOYMENT_KIND:
    process.env.NEXT_PUBLIC_DEPLOYMENT_KIND || undefined,
  NEXT_PUBLIC_PHONE_AUTH_ENABLED: process.env.NEXT_PUBLIC_PHONE_AUTH_ENABLED,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
})

if (!result.success) {
  throw envError('public', result.error)
}

export const publicEnv = result.data

export function getRazorpayPublicKey() {
  const key = publicEnv.NEXT_PUBLIC_RAZORPAY_KEY_ID
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_RAZORPAY_KEY_ID is required to start a payment',
    )
  }
  return key
}
