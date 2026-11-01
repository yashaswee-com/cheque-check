import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ContactSubmissionError,
  sendContactMessage,
} from './contact.repository'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('contact repository', () => {
  it('submits only the contact payload to the public endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetch)
    const input = {
      name: 'Jamie Example',
      email: 'jamie@example.test',
      message: 'Please help me organize my cheque records.',
    }

    await expect(sendContactMessage(input)).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  })

  it('maps rate limits and provider failures without exposing response content', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'rate_limited' }, { status: 429 }),
        ),
    )
    await expect(
      sendContactMessage({
        name: 'Jamie',
        email: 'jamie@example.test',
        message: 'Please help me with my cheque records.',
      }),
    ).rejects.toEqual(new ContactSubmissionError('rate_limited'))

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private server detail')),
    )
    await expect(
      sendContactMessage({
        name: 'Jamie',
        email: 'jamie@example.test',
        message: 'Please help me with my cheque records.',
      }),
    ).rejects.toEqual(new ContactSubmissionError('submit_failed'))
  })
})
