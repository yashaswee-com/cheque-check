import type { ContactMessage } from '@/validators/contact'

export type ContactErrorCode = 'rate_limited' | 'submit_failed'

export class ContactSubmissionError extends Error {
  constructor(readonly code: ContactErrorCode) {
    super(code)
    this.name = 'ContactSubmissionError'
  }
}

export async function sendContactMessage(input: ContactMessage) {
  let response: Response
  try {
    response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new ContactSubmissionError('submit_failed')
  }

  if (response.ok) return

  let code: string | undefined
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body && 'error' in body)
      code = String(body.error)
  } catch {
    // The form displays a generic error when a server response is malformed.
  }

  throw new ContactSubmissionError(
    code === 'rate_limited' ? 'rate_limited' : 'submit_failed',
  )
}
