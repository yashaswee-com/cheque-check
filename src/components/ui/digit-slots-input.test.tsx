import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DigitSlotsInput } from './digit-slots-input'

afterEach(cleanup)

function Controlled({
  onChange = vi.fn(),
  initial = '',
  length,
}: {
  onChange?: (value: string) => void
  initial?: string
  length?: number
}) {
  const [value, setValue] = useState(initial)
  return (
    <DigitSlotsInput
      id="number"
      data-testid="number-input"
      length={length}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

const slots = () =>
  Array.from(document.querySelectorAll('[data-slot="digit-slot"]'))

describe('DigitSlotsInput', () => {
  it('renders six numeric slots backed by one accessible input', () => {
    render(<Controlled initial="1234" />)
    const input = screen.getByTestId('number-input')
    expect(input).toHaveAttribute('id', 'number')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('maxlength', '6')
    expect(slots()).toHaveLength(6)
    expect(slots().map((slot) => slot.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '',
      '',
    ])
  })

  it('accepts digits and rejects non-digit input', () => {
    const onChange = vi.fn()
    render(<Controlled onChange={onChange} />)
    const input = screen.getByTestId('number-input')
    fireEvent.change(input, { target: { value: '123456' } })
    expect(onChange).toHaveBeenLastCalledWith('123456')
    onChange.mockClear()
    fireEvent.change(input, { target: { value: '12a' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('123456')
  })

  it('supports other lengths and marks invalid slots', () => {
    const { rerender } = render(<Controlled length={4} />)
    expect(slots()).toHaveLength(4)
    rerender(<DigitSlotsInput value="" onChange={vi.fn()} invalid />)
    expect(slots()[0]).toHaveClass('border-destructive')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  })
})
