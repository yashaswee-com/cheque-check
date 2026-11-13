import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Tag01Icon } from '@hugeicons/core-free-icons'
import { Checkbox } from './checkbox'
import { Switch } from './switch'
import { CurrencyPrefixInput } from './currency-prefix-input'
import { Progress } from './progress'
import { FormSection } from './form-section'
import { Label } from './label'
import { CreationSuccessScreen } from './creation-success-screen'

afterEach(cleanup)

it('marks only required labels with a small red asterisk', () => {
  render(
    <>
      <Label required htmlFor="name">
        Name
      </Label>
      <Label>Notes</Label>
    </>,
  )
  // The marker is a CSS pseudo-element, so it never pollutes the accessible name.
  const required = screen.getByText('Name')
  expect(required).toHaveAttribute('data-required', 'true')
  expect(required).toHaveClass('after:text-destructive', "after:content-['*']")
  expect(screen.getByText('Notes')).not.toHaveAttribute('data-required')
  expect(screen.queryByText('*')).toBeNull()
})

it('toggles checkbox and switch controls and preserves their accessibility labels', () => {
  const checked = vi.fn(),
    switched = vi.fn()
  render(
    <>
      <Checkbox aria-label="Select cheque" onCheckedChange={checked} />
      <Switch
        aria-label="Send reminders"
        size="sm"
        onCheckedChange={switched}
      />
    </>,
  )
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('switch'))
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(screen.getByRole('switch')).toBeChecked()
  expect(checked).toHaveBeenCalledWith(true, expect.anything())
  expect(switched).toHaveBeenCalledWith(true, expect.anything())
})

it('renders form sections and currency fields with forwarded refs and updates progress', () => {
  const ref = createRef<HTMLInputElement>()
  const { rerender } = render(
    <FormSection title="Amount" icon={Tag01Icon}>
      <CurrencyPrefixInput
        ref={ref}
        currency="₹"
        aria-label="Amount"
        defaultValue="125"
      />
      <Progress data-testid="progress" value={25} />
    </FormSection>,
  )
  expect(ref.current).toBe(screen.getByRole('textbox'))
  expect(ref.current).toHaveClass('pl-10')
  expect(screen.getByText('₹')).toBeInTheDocument()
  expect(screen.getByTestId('progress').firstElementChild).toHaveStyle({
    transform: 'translateX(-75%)',
  })
  rerender(<Progress data-testid="progress" />)
  expect(screen.getByTestId('progress').firstElementChild).toHaveStyle({
    transform: 'translateX(-100%)',
  })
})

it('shows successful creation and invokes the continuation action', () => {
  const next = vi.fn()
  render(
    <CreationSuccessScreen
      title="Cheque created"
      description="Your cheque is saved."
      ctaLabel="Continue"
      onContinue={next}
    />,
  )
  expect(
    screen.getByRole('heading', { name: 'Cheque created' }),
  ).toBeInTheDocument()
  expect(screen.getByText('Your cheque is saved.')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('creation-success-continue'))
  expect(next).toHaveBeenCalledOnce()
})
