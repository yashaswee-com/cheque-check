import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { Button } from './button'

afterEach(cleanup)

describe('Button pending state', () => {
  it('retains labels for measurement, marks busy and prevents repeated form submission', () => {
    const submit = vi.fn((event) => event.preventDefault())
    const { rerender } = render(
      <form onSubmit={submit}>
        <Button type="submit" loading={false} loadingText="Saving">
          Save cheque
        </Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save cheque' }))
    expect(submit).toHaveBeenCalledTimes(1)
    rerender(
      <form onSubmit={submit}>
        <Button type="submit" loading loadingText="Saving">
          Save cheque
        </Button>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Save cheque')).toHaveClass('invisible')
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('preserves refs, variants, form attributes and the default native button behavior', () => {
    const ref = createRef<HTMLButtonElement>()
    render(
      <Button
        ref={ref}
        type="submit"
        form="edit-form"
        name="action"
        value="save"
        variant="destructive"
        size="lg"
      >
        Save
      </Button>,
    )
    expect(ref.current).toBe(screen.getByRole('button'))
    expect(ref.current).toHaveAttribute('type', 'submit')
    expect(ref.current).toHaveAttribute('form', 'edit-form')
    expect(ref.current).toHaveAttribute('name', 'action')
    expect(ref.current).toHaveAttribute('value', 'save')
    expect(ref.current).toHaveClass('bg-destructive/10', 'h-12')
  })

  it.each(['start', 'end'] as const)(
    'keeps icon-only actions named with spinner at %s',
    (spinnerPosition) => {
      render(
        <Button
          size="icon"
          aria-label="Refresh access"
          loading
          spinnerPosition={spinnerPosition}
        >
          <svg data-testid="original-icon" />
        </Button>,
      )
      expect(
        screen.getByRole('button', { name: 'Refresh access' }),
      ).toHaveAttribute('aria-busy', 'true')
      expect(screen.getByTestId('original-icon').parentElement).toHaveClass(
        'invisible',
      )
    },
  )

  it('prevents pending render-composed link activation', () => {
    const click = vi.fn()
    render(
      <Button render={<a href="/reports" />} loading onClick={click}>
        Reports
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(click).not.toHaveBeenCalled()
  })

  it('retains the ordinary label when pending text is omitted', () => {
    render(
      <Button loading spinnerPosition="end">
        Export
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.getAllByText('Export')).toHaveLength(1)
  })
})
