import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import { EmailLinkSection } from './components/email-link-section'
import { emailLinkRepository } from './repositories/email-link.repository'
import { EmailLinkError } from './email-link.types'
const mocks = vi.hoisted(() => ({
  data: { email: null as string | null },
  send: vi.fn(),
  getUser: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('./hooks/use-email-link', () => ({
  useEmailLink: () => ({ ...mocks, error: null, isLoading: false }),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.data = { email: null }
  mocks.send.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <EmailLinkSection />
    </NextIntlClientProvider>,
  )
}
describe('verified email UI', () => {
  it('never reports linked email after merely sending verification', async () => {
    mount()
    fireEvent.change(screen.getByLabelText(messages.EmailLink.newEmail), {
      target: { value: 'person@example.test' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: messages.EmailLink.send }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'not linked until verified',
    )
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(mocks.send).toHaveBeenCalledWith('person@example.test')
  })
  it('does not offer replacement of a verified email', () => {
    mocks.data.email = 'linked@example.test'
    mount()
    expect(screen.getByLabelText('Email')).toHaveValue('linked@example.test')
    expect(
      screen.queryByRole('button', { name: messages.EmailLink.send }),
    ).not.toBeInTheDocument()
  })
  it('shows claimed email rejection without a success message', async () => {
    mocks.send.mockRejectedValue(new EmailLinkError('email_in_use'))
    mount()
    fireEvent.change(screen.getByLabelText(messages.EmailLink.newEmail), {
      target: { value: 'claimed@example.test' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: messages.EmailLink.send }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'another account',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
describe('email link repository', () => {
  it('ignores unconfirmed auth email and accepts only verified identity', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'pending@example.test' } },
      error: null,
    })
    expect(await emailLinkRepository.identity()).toEqual({ email: null })
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'linked@example.test',
          email_confirmed_at: '2026-11-01',
        },
      },
      error: null,
    })
    expect(await emailLinkRepository.identity()).toEqual({
      email: 'linked@example.test',
    })
  })
  it('validates send responses and propagates claimed-account rejection', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'email_in_use' }), {
          status: 409,
        }),
      )
    await expect(
      emailLinkRepository.send('claimed@example.test'),
    ).rejects.toMatchObject({ code: 'email_in_use' })
    fetch.mockResolvedValue(new Response(JSON.stringify({ success: true })))
    await expect(
      emailLinkRepository.send('a@example.test'),
    ).rejects.toMatchObject({ code: 'send_failed' })
    await expect(emailLinkRepository.send('bad')).rejects.toMatchObject({
      code: 'invalid_email',
    })
  })
})
