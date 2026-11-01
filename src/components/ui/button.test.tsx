import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { Button } from './button'

afterEach(cleanup)

describe('Button pending state', () => {
  it('retains labels for measurement, marks busy and prevents repeated form submission', () => {
    const submit = vi.fn((event) => event.preventDefault())
    const { rerender } = render(
      <form onSubmit={submit}>
        <Button type="submit" loading={false}>
          Save cheque
        </Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save cheque' }))
    expect(submit).toHaveBeenCalledTimes(1)
    rerender(
      <form onSubmit={submit}>
        <Button type="submit" loading>
          Save cheque
        </Button>
      </form>,
    )
    const button = screen.getByRole('button', { name: 'Save cheque' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Save cheque')).toHaveClass('opacity-0')
    expect(button.querySelectorAll('.animate-spin')).toHaveLength(1)
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

  it.each(['icon', 'icon-sm'] as const)(
    'keeps %s actions named while replacing their icon with one spinner',
    (size) => {
      render(
        <Button size={size} aria-label="Refresh access" loading>
          <svg data-testid="original-icon" />
        </Button>,
      )
      expect(
        screen.getByRole('button', { name: 'Refresh access' }),
      ).toHaveAttribute('aria-busy', 'true')
      expect(screen.getByTestId('original-icon').parentElement).toHaveClass(
        'opacity-0',
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

  it('retains the ordinary label for assistive technology while showing only a spinner', () => {
    render(<Button loading>Export</Button>)
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(screen.getAllByText('Export')).toHaveLength(1)
  })

  it('does not reserve additional spinner space when idle', () => {
    render(<Button loading={false}>Export</Button>)
    expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled()
    expect(screen.getByRole('button').querySelector('svg')).toBeNull()
    expect(screen.getByText('Export')).not.toHaveClass('opacity-0')
  })

  it('tracks promise-returning actions independently and clears pending on completion', async () => {
    const task = Promise.withResolvers<void>()
    const click = vi.fn(() => task.promise)
    render(
      <>
        <Button onClick={click}>Download</Button>
        <Button>Other action</Button>
      </>,
    )
    const button = screen.getByRole('button', { name: 'Download' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Other action' })).toBeEnabled()
    fireEvent.click(button)
    expect(click).toHaveBeenCalledOnce()
    await act(async () => task.resolve())
    expect(button).toBeEnabled()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('.animate-spin')).toBeNull()
  })

  it('does not mark synchronous toggles as loading or override positioning', () => {
    const click = vi.fn()
    render(
      <Button className="fixed bottom-6" onClick={click}>
        Toggle
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Toggle' })
    fireEvent.click(button)
    expect(click).toHaveBeenCalledOnce()
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button).toHaveClass('fixed')
    expect(button).not.toHaveClass('relative')
  })
})
