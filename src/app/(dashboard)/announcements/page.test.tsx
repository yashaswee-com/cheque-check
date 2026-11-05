import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import messages from '../../../../messages/en.json'
import AnnouncementsPage from './page'

describe('announcements page', () => {
  it('supports search, filter state, and mark all read', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AnnouncementsPage />
      </NextIntlClientProvider>,
    )

    expect(
      screen.getByRole('button', { name: /mark all read/i }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/search announcements/i), {
      target: { value: 'security' },
    })

    expect(screen.getByText('Security update')).toBeInTheDocument()
    expect(
      screen.queryByText('New reporting dashboard'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Unread updates$/i }))
    expect(screen.getByText('Security update')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })
})
