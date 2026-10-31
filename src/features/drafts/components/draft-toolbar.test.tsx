import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DraftToolbar } from './draft-toolbar'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(cleanup)

describe('DraftToolbar', () => {
  it('hides status when no save is in progress', () => {
    const { container } = render(<DraftToolbar status="idle" />)
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    { status: 'saving' as const, label: 'saving' },
    { status: 'saved' as const, label: 'saved' },
    { status: 'error' as const, label: 'saveFailed' },
  ])('announces the $status state', ({ status, label }) => {
    render(<DraftToolbar status={status} />)
    const announcement = screen.getByText(label)
    expect(announcement).toHaveAttribute('aria-live', 'polite')
    expect(announcement).toHaveClass(
      status === 'error' ? 'text-destructive' : 'text-muted-foreground',
    )
  })

  it('updates the announcement when a failed save is retried', () => {
    const { rerender } = render(<DraftToolbar status="error" />)
    rerender(<DraftToolbar status="saving" />)
    expect(screen.queryByText('saveFailed')).not.toBeInTheDocument()
    expect(screen.getByText('saving')).toHaveAttribute('aria-live', 'polite')
    rerender(<DraftToolbar status="saved" />)
    expect(screen.getByText('saved')).toBeInTheDocument()
    expect(screen.queryByText('saving')).not.toBeInTheDocument()
  })
})
