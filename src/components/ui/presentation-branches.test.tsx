import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntityAvatar } from './entity-avatar'
import { EmptyState } from './empty-state'
import { StatusPill } from './status-pill'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('presentation fallback contracts', () => {
  it('reveals a cached image only when it completed with a positive natural width', () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(
      true,
    )
    const width = vi
      .spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get')
      .mockReturnValue(100)
    const { rerender } = render(
      <EntityAvatar name="Cached" imageUrl="/cached.png" />,
    )
    expect(screen.getByRole('img', { name: 'Cached' })).not.toHaveClass(
      'invisible',
    )
    width.mockReturnValue(0)
    rerender(<EntityAvatar name="Broken" imageUrl="/broken.png" />)
    expect(screen.getByRole('img', { name: 'Broken' })).toHaveClass('invisible')
  })
  it.each(['sm', 'md', 'lg'] as const)(
    'uses initials and failed-image fallbacks at %s size',
    (size) => {
      const { rerender } = render(
        <EntityAvatar name="" size={size} color="#123456" />,
      )
      expect(screen.getByText('?')).toBeInTheDocument()
      rerender(<EntityAvatar name="" size={size} imageUrl="/missing.png" />)
      fireEvent.error(screen.getByRole('presentation'))
      expect(screen.getByText('?')).toBeInTheDocument()
      rerender(<EntityAvatar name="Asha" size={size} imageUrl="/new.png" />)
      fireEvent.error(screen.getByRole('img', { name: 'Asha' }))
      expect(screen.getByText('A')).toBeInTheDocument()
    },
  )

  it('uses icon avatars only for recognized icons and honors image priority', () => {
    const { container, rerender } = render(
      <EntityAvatar name="Asha" icon="Tag01Icon" />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
    rerender(<EntityAvatar name="Asha" icon="not-an-icon" />)
    expect(screen.getByText('A')).toBeInTheDocument()
    rerender(<EntityAvatar name="Asha" icon="Tag01Icon" imageUrl="/asha.png" />)
    fireEvent.load(screen.getByRole('img', { name: 'Asha' }))
    expect(screen.getByRole('img', { name: 'Asha' })).not.toHaveClass(
      'invisible',
    )
  })

  it('supports illustration priority and actions without a handler or a destination', () => {
    render(
      <EmptyState
        title="Nothing yet"
        illustration={<span>Illustration</span>}
        action={{ label: 'Unavailable' }}
      />,
    )
    expect(screen.getByText('Illustration')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unavailable' })).toBeEnabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it.each([
    'Issued',
    'Received',
    'Cleared',
    'Bounced',
    'Today',
    'Overdue',
    'Upcoming',
  ] as const)('maps every allowed status %s to a styled pill', (status) => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StatusPill status={status} className="custom" />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(status)).toHaveClass('custom')
    expect(screen.getByText(status).className).toMatch(/bg-/)
  })
})
