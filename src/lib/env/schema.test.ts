import { describe, expect, it } from 'vitest'
import {
  monitoringEnvSchema,
  openAiEnvSchema,
  publicEnvSchema,
  razorpayEnvSchema,
  supabaseAdminEnvSchema,
} from './schema'

describe('publicEnvSchema', () => {
  it('accepts the required Supabase configuration', () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid URLs and log levels', () => {
    const result = publicEnvSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'not-a-url',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_LOG_LEVEL: 'verbose',
    })

    expect(result.success).toBe(false)
  })

  it('treats blank optional feature variables as unset', () => {
    const result = publicEnvSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      NEXT_PUBLIC_RAZORPAY_KEY_ID: '',
    })

    expect(result.NEXT_PUBLIC_RAZORPAY_KEY_ID).toBeUndefined()
  })
})

describe('publicEnvSchema phone auth and environment guards', () => {
  const base = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  }

  it('defaults phone auth off', () => {
    const result = publicEnvSchema.parse(base)
    expect(result.NEXT_PUBLIC_PHONE_AUTH_ENABLED).toBe('false')
  })

  it('allows a local Supabase URL for local development', () => {
    expect(
      publicEnvSchema.safeParse({
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
        NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true',
      }).success,
    ).toBe(true)
  })

  it.each([
    { NEXT_PUBLIC_APP_ENV: 'production' },
    { NEXT_PUBLIC_APP_ENV: 'qa' },
    { NEXT_PUBLIC_DEPLOYMENT_KIND: 'preview' },
  ])('rejects a local Supabase URL when %j', (extra) => {
    expect(
      publicEnvSchema.safeParse({
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
        ...extra,
      }).success,
    ).toBe(false)
  })

  it('requires a Turnstile site key for production phone auth', () => {
    const production = {
      ...base,
      NEXT_PUBLIC_APP_ENV: 'production',
      NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true',
    }
    expect(publicEnvSchema.safeParse(production).success).toBe(false)
    expect(
      publicEnvSchema.safeParse({
        ...production,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-key',
      }).success,
    ).toBe(true)
  })
})

describe('monitoringEnvSchema', () => {
  it('disables monitoring unless explicitly configured', () => {
    const config = monitoringEnvSchema.parse({})
    expect(config.NEXT_PUBLIC_OBSERVABILITY_ENABLED).toBe('false')
    expect(config.NEXT_PUBLIC_MONITORING_POLICY_APPROVED).toBe('false')
    expect(config.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE).toBe(0.05)
    expect(config.NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE).toBe(0.01)
    expect(config.NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE).toBe(0.25)
    expect(
      monitoringEnvSchema.parse({
        NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '',
        NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE: '',
        NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE: '',
      }).NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    ).toBe(0.05)
  })

  it('requires explicit environment and release when enabled', () => {
    expect(
      monitoringEnvSchema.safeParse({
        NEXT_PUBLIC_OBSERVABILITY_ENABLED: 'true',
      }).success,
    ).toBe(false)
    const config = monitoringEnvSchema.parse({
      NEXT_PUBLIC_OBSERVABILITY_ENABLED: 'true',
      NEXT_PUBLIC_APP_ENV: 'qa',
      NEXT_PUBLIC_APP_RELEASE: 'cheque-check@test-sha',
    })
    expect(config.NEXT_PUBLIC_APP_ENV).toBe('qa')
  })

  it('rejects invalid rates, flags, project IDs and production previews', () => {
    for (const value of [
      { NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '1.1' },
      { NEXT_PUBLIC_SENTRY_REPLAY_SAMPLE_RATE: '-1' },
      { NEXT_PUBLIC_SENTRY_ERROR_REPLAY_SAMPLE_RATE: 'invalid' },
      { NEXT_PUBLIC_OBSERVABILITY_ENABLED: 'yes' },
      { NEXT_PUBLIC_CLARITY_PROJECT_ID: '../secret' },
      {
        NEXT_PUBLIC_OBSERVABILITY_ENABLED: 'true',
        NEXT_PUBLIC_APP_ENV: 'production',
        NEXT_PUBLIC_APP_RELEASE: 'test',
        NEXT_PUBLIC_DEPLOYMENT_KIND: 'preview',
      },
    ]) {
      expect(monitoringEnvSchema.safeParse(value).success).toBe(false)
    }
  })
})

describe('feature environment schemas', () => {
  it('requires an OpenAI key when OCR is used', () => {
    expect(openAiEnvSchema.safeParse({ OPENAI_API_KEY: '' }).success).toBe(
      false,
    )
  })

  it('requires both Razorpay server credentials', () => {
    expect(
      razorpayEnvSchema.safeParse({
        RAZORPAY_KEY_ID: 'key',
        RAZORPAY_KEY_SECRET: '',
      }).success,
    ).toBe(false)
  })

  it('requires the Supabase service-role key for admin operations', () => {
    expect(
      supabaseAdminEnvSchema.safeParse({ SUPABASE_SERVICE_ROLE_KEY: '' })
        .success,
    ).toBe(false)
  })
})
