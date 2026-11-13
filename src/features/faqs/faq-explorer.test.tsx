import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import messages from '../../../messages/en.json'
import { FaqExplorer } from './components/faq-explorer'

function mount() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FaqExplorer />
    </NextIntlClientProvider>,
  )
}

afterEach(cleanup)

describe('searchable branched FAQs', () => {
  it('searches answers and reports when there are no matches', () => {
    mount()
    fireEvent.change(screen.getByLabelText('Search FAQs'), {
      target: { value: 'camera' },
    })
    expect(
      screen.getByRole('button', { name: 'How can I scan a cheque?' }),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search FAQs'), {
      target: { value: 'unmatched phrase' },
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'No questions match your search.',
    )
  })

  it('follows a related branch and exposes the report-issue route', () => {
    mount()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'How do I add a cheque?',
      }),
    )
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'How can I scan a cheque?',
      })[1],
    )
    expect(screen.getByText(/camera or photo library/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Report issue' })).toHaveAttribute(
      'href',
      '/feedback/create?category=bug',
    )
  })

  it('filters FAQ categories', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Privacy/security' }))
    expect(
      screen.getByRole('button', { name: 'How is my cheque data protected?' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'How do I add a cheque?' }),
    ).not.toBeInTheDocument()
  })
})
