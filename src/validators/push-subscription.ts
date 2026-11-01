import { z } from 'zod'
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .regex(
      /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[A-Za-z0-9_/?=&%+.-]+$/,
    ),
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
})
