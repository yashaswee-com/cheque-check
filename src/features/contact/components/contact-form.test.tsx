import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContactSubmissionError } from '@/features/contact/repositories/contact.repository'
import messages from '../../../../messages/en.json'
import hindi from '../../../../messages/hi.json'
import hinglish from '../../../../messages/hi-en.json'
import { ContactForm } from './contact-form'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('@/features/contact/repositories/contact.repository', () => ({
  sendContactMessage: mocks.send,
  ContactSubmissionError: class ContactSubmissionError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderForm(
  locale: 'en' | 'hi' | 'hi-en',
  catalog: {
    PublicSite: {
      contact: {
        name: string
        email: string
        message: string
        submit: string
        success: string
        rateLimited: string
      }
    }
  },
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalog}>
      <ContactForm />
    </NextIntlClientProvider>,
  )
}

describe('public contact form', () => {
  it.each([
    ['en', messages],
    ['hi', hindi],
    ['hi-en', hinglish],
  ] as const)(
    'renders accessible localized fields in %s',
    (locale, catalog) => {
      renderForm(locale, catalog)
      expect(
        screen.getByLabelText(catalog.PublicSite.contact.name),
      ).toBeVisible()
      expect(
        screen.getByLabelText(catalog.PublicSite.contact.email),
      ).toBeVisible()
      expect(
        screen.getByLabelText(catalog.PublicSite.contact.message),
      ).toBeVisible()
    },
  )

  it('clears private form data and reports success after submission', async () => {
    mocks.send.mockResolvedValue(undefined)
    renderForm('en', messages)
    fireEvent.change(screen.getByLabelText(messages.PublicSite.contact.name), {
      target: { value: 'Jamie Example' },
    })
    fireEvent.change(screen.getByLabelText(messages.PublicSite.contact.email), {
      target: { value: 'jamie@example.test' },
    })
    fireEvent.change(
      screen.getByLabelText(messages.PublicSite.contact.message),
      { target: { value: 'Please help me organize cheque records.' } },
    )
    fireEvent.submit(
      screen
        .getByRole('button', {
          name: messages.PublicSite.contact.submit,
        })
        .closest('form')!,
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        messages.PublicSite.contact.success,
      ),
    )
    expect(mocks.send).toHaveBeenCalledWith({
      name: 'Jamie Example',
      email: 'jamie@example.test',
      message: 'Please help me organize cheque records.',
    })
    expect(screen.getByLabelText(messages.PublicSite.contact.name)).toHaveValue(
      '',
    )
    expect(
      screen.getByLabelText(messages.PublicSite.contact.email),
    ).toHaveValue('')
  })

  it('announces rate limiting without reflecting submitted information', async () => {
    mocks.send.mockRejectedValue(new ContactSubmissionError('rate_limited'))
    renderForm('en', messages)
    fireEvent.change(screen.getByLabelText(messages.PublicSite.contact.name), {
      target: { value: 'Private Person' },
    })
    fireEvent.change(screen.getByLabelText(messages.PublicSite.contact.email), {
      target: { value: 'private@example.test' },
    })
    fireEvent.change(
      screen.getByLabelText(messages.PublicSite.contact.message),
      { target: { value: 'Private information in this message.' } },
    )
    fireEvent.submit(
      screen
        .getByRole('button', {
          name: messages.PublicSite.contact.submit,
        })
        .closest('form')!,
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        messages.PublicSite.contact.rateLimited,
      ),
    )
    expect(screen.queryByText('Private Person')).not.toBeInTheDocument()
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument()
  })
})
