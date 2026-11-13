import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DraftSaveStatus } from '../hooks/use-draft-autosave'
import { DraftSaveFab } from './draft-save-fab'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(cleanup)

describe('DraftSaveFab', () => {
  it('fits beside the primary form action without floating over it', () => {
    render(
      <DraftSaveFab docked status="idle" hasUserChanges onSave={vi.fn()} />,
    )
    expect(screen.getByTestId('draft-save-button')).toHaveClass(
      'relative',
      'h-12',
      'w-12',
      'shrink-0',
    )
    expect(screen.getByTestId('draft-save-button')).not.toHaveClass('fixed')
  })
  it.each([
    { status: 'idle', hasUserChanges: false, disabled: true },
    { status: 'idle', hasUserChanges: true, disabled: false },
    { status: 'saving', hasUserChanges: false, disabled: true },
    { status: 'saving', hasUserChanges: true, disabled: true },
    { status: 'saved', hasUserChanges: false, disabled: false },
    { status: 'saved', hasUserChanges: true, disabled: false },
    { status: 'error', hasUserChanges: false, disabled: false },
    { status: 'error', hasUserChanges: true, disabled: false },
  ] satisfies {
    status: DraftSaveStatus
    hasUserChanges: boolean
    disabled: boolean
  }[])(
    'controls saves for $status with user changes=$hasUserChanges',
    ({ status, hasUserChanges, disabled }) => {
      const onSave = vi.fn()
      render(
        <DraftSaveFab
          status={status}
          hasUserChanges={hasUserChanges}
          onSave={onSave}
        />,
      )
      const button = screen.getByRole('button', { name: 'saveDraft' })
      expect(button).toHaveAttribute('type', 'button')
      if (disabled) expect(button).toBeDisabled()
      else expect(button).toBeEnabled()
      fireEvent.click(button)
      expect(onSave).toHaveBeenCalledTimes(disabled ? 0 : 1)
      if (status === 'saving')
        expect(button).toHaveAttribute('aria-busy', 'true')
      else expect(button).not.toHaveAttribute('aria-busy')
    },
  )

  it('allows repeated saves after saving completes', () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <DraftSaveFab status="saving" hasUserChanges onSave={onSave} />,
    )
    const button = screen.getByRole('button', { name: 'saveDraft' })
    expect(button).toBeDisabled()
    rerender(
      <DraftSaveFab status="saved" hasUserChanges={false} onSave={onSave} />,
    )
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onSave).toHaveBeenCalledTimes(2)
  })
})
