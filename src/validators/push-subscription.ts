import { z } from 'zod'

const supportedPushHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])

function isSupportedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)

    if (url.protocol !== 'https:') return false
    if (url.username || url.password || url.hash) return false
    if (url.port) return false

    const hostname = url.hostname.toLowerCase()
    const allowedHost =
      supportedPushHosts.has(hostname) ||
      (hostname.endsWith('.notify.windows.com') &&
        /^([a-z0-9-]+\.)*notify\.windows\.com$/i.test(hostname))

    if (!allowedHost) return false
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false
    if (endpoint.length > 2048) return false

    return url.pathname.length > 0
  } catch {
    return false
  }
}

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isSupportedPushEndpoint, {
    message: 'Must be a secure browser push endpoint from a supported provider',
  }),
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
})
