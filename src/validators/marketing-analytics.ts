import { z } from 'zod'

export const campaignValue = z.string().regex(/^[a-zA-Z0-9_. -]{1,80}$/)
export const touchSchema = z
  .object({
    utm_source: campaignValue.optional(),
    utm_medium: campaignValue.optional(),
    utm_campaign: campaignValue.optional(),
    utm_content: campaignValue.optional(),
    utm_term: campaignValue.optional(),
    referrer_origin: z
      .url()
      .max(200)
      .refine(
        (value) =>
          URL.canParse(value) &&
          new URL(value).origin === value &&
          /^https?:/.test(value),
      )
      .optional(),
  })
  .strict()

export const requestSchema = z
  .object({
    action: z.enum(['sync', 'onboarding_completed', 'blocked']),
    accepted: z.boolean(),
    explicitChoice: z.boolean().default(false),
    hasChoice: z.boolean().default(true),
    sessionId: z.uuid().optional(),
    route: z.enum([
      '/',
      '/signup',
      '/onboarding',
      '/dashboard',
      '/premium',
      '/app',
    ]),
    firstTouch: touchSchema.optional(),
    lastTouch: touchSchema.optional(),
    fbclid: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,500}$/)
      .optional(),
    feature: z
      .enum(['cheques', 'ai_scan', 'voice_reminder', 'trial_expired'])
      .optional(),
  })
  .strict()

export const browserEventSchema = z.object({
  id: z.uuid(),
  event_name: z.string(),
  meta_event_name: z.string(),
  details: z.record(z.string(), z.unknown()),
})
export const browserEventsSchema = z.array(browserEventSchema)
export const responseSchema = z.object({
  accepted: z.boolean(),
  events: browserEventsSchema,
})
export const cookieSchema = z.object({
  visitor: z.uuid(),
  acceptedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
})
export type BrowserEvent = z.infer<typeof browserEventSchema>
export type MarketingRequest = z.infer<typeof requestSchema>
export type MarketingTouch = z.infer<typeof touchSchema>
export type MarketingCookie = z.infer<typeof cookieSchema>
