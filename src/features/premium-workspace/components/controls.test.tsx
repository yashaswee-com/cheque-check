import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TextField, SelectField } from './controls'

afterEach(cleanup)

it('uses the shared required label without changing text control styling', () => {
  render(<TextField label="Tool name" required />)
  const control = screen.getByRole('textbox', { name: 'Tool name' })
  const label = screen.getByText('Tool name')
  expect(control).toBeRequired()
  expect(control).toHaveClass('min-h-11', 'border', 'rounded-md')
  expect(label).toHaveAttribute('data-slot', 'form-label')
  expect(label).toHaveAttribute('for', control.id)
  expect(
    label.querySelector('[data-slot="required-indicator"]'),
  ).toHaveAttribute('aria-hidden', 'true')
})

it('keeps optional selectors unmarked and distinguishes label associations', () => {
  render(
    <>
      <SelectField label="Direction" required>
        <option>Inward</option>
      </SelectField>
      <SelectField label="Status">
        <option>Pending</option>
      </SelectField>
    </>,
  )
  const direction = screen.getByRole('combobox', { name: 'Direction' })
  const status = screen.getByRole('combobox', { name: 'Status' })
  expect(direction).toBeRequired()
  expect(status).not.toBeRequired()
  expect(direction.id).not.toBe(status.id)
  expect(screen.getByText('Direction')).toHaveAttribute('data-required', 'true')
  expect(screen.getByText('Status')).not.toHaveAttribute('data-required')
})
