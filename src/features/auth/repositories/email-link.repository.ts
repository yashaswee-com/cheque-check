import { createClient } from '@/lib/supabase/client'
import { emailLinkSchema } from '@/validators/email-link'
import { EmailLinkError } from '../email-link.types'
export const emailLinkRepository = {
  async identity() {
    const {
      data: { user },
      error,
    } = await createClient().auth.getUser()
    if (error) throw error
    if (!user) throw new EmailLinkError('unauthorized')
    return { email: user.email && user.email_confirmed_at ? user.email : null }
  },
  async send(email: string) {
    const parsed = emailLinkSchema.safeParse({ email })
    if (!parsed.success) throw new EmailLinkError('invalid_email')
    const response = await fetch('/api/auth/email/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    })
    const body: unknown = await response.json()
    if (!response.ok)
      throw new EmailLinkError(
        typeof body === 'object' &&
          body &&
          'error' in body &&
          typeof body.error === 'string'
          ? body.error
          : 'send_failed',
      )
    if (
      !body ||
      typeof body !== 'object' ||
      !('pending' in body) ||
      body.pending !== true
    )
      throw new EmailLinkError('send_failed')
  },
}
