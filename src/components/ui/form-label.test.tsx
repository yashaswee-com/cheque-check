import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { UserIcon } from '@hugeicons/core-free-icons'
import { FormLabel } from './form-label'

afterEach(cleanup)

it('renders an icon before sentence-case text and associates the control', () => {
  const ref = createRef<HTMLLabelElement>()
  render(
    <>
      <FormLabel
        ref={ref}
        icon={UserIcon}
        htmlFor="full-name"
        className="text-xs"
        is_required
      >
        Full name
      </FormLabel>
      <input id="full-name" required />
    </>,
  )

  const label = screen.getByText('Full name')
  expect(ref.current).toBe(label)
  expect(label).toHaveAttribute('data-slot', 'form-label')
  expect(label).toHaveClass('text-xs')
  expect(label).not.toHaveClass('uppercase', 'capitalize')
  expect(label.firstElementChild).toHaveAttribute('aria-hidden', 'true')
  expect(label.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  expect(label).toHaveAttribute('data-required', 'true')
  const marker = label.querySelector('[data-slot="required-indicator"]')
  expect(marker?.tagName.toLowerCase()).toBe('svg')
  expect(marker).toHaveAttribute('aria-hidden', 'true')
  expect(marker).toHaveClass('size-3', 'text-destructive')
  expect(label).not.toHaveClass("after:content-['*']")
  expect(screen.getByRole('textbox', { name: 'Full name' })).toBeRequired()
  expect(screen.queryByText('*')).not.toBeInTheDocument()
})

it('omits the required marker by default and preserves localized text and acronyms', () => {
  const { rerender } = render(<FormLabel icon={UserIcon}>OTP code</FormLabel>)
  expect(screen.getByText('OTP code')).not.toHaveAttribute('data-required')
  expect(screen.getByText('OTP code')).not.toHaveClass("after:content-['*']")
  expect(
    screen
      .getByText('OTP code')
      .querySelector('[data-slot="required-indicator"]'),
  ).toBeNull()

  rerender(<FormLabel icon={UserIcon}>Poora naam</FormLabel>)
  expect(screen.getByText('Poora naam')).toBeInTheDocument()
})
