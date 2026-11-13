import { useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { AdvancedChequeFilters } from './advanced-cheque-filters'
import { amountSliderScale } from './amount-range-filter'
import { parseChequeListUrl } from '@/validators/cheque-list-filters'

const bank = '10000000-0000-4000-8000-000000000001'
vi.mock('@/features/accounts/hooks/use-banks', () => ({
  useBanks: () => ({
    data: [{ id: bank, name: 'Custom Bank', abbreviation: 'CB' }],
  }),
}))
const bounds = vi.hoisted(() => ({
  data: { min: 0, max: 125_000 } as { min: number; max: number } | undefined,
}))
vi.mock('@/features/cheques/hooks/use-cheque-list', () => ({
  useChequeAmountBounds: () => bounds,
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { time_zone: 'Asia/Kolkata' } }),
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    options,
    onValueChange,
  }: {
    options: { value: string; label: string }[]
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label="Bank"
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))
afterEach(() => {
  cleanup()
  bounds.data = { min: 0, max: 125_000 }
})

function Harness({ initial = '' }: { initial?: string }) {
  const [params, setParams] = useState(new URLSearchParams(initial))
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdvancedChequeFilters
        businessId="business-1"
        params={params}
        onValidityChange={() => undefined}
        onClear={() => setParams(new URLSearchParams())}
        onChange={(key, value) =>
          setParams((previous) => {
            const next = new URLSearchParams(previous)
            if (value) next.set(key, value)
            else next.delete(key)
            return next
          })
        }
      />
      <output data-testid="query">{params.toString()}</output>
    </NextIntlClientProvider>
  )
}

it('labels the status section and gives every filter pill an icon', () => {
  render(<Harness />)
  expect(screen.getByText('Cheque status')).toBeVisible()
  expect(screen.queryByText('Filter Status')).not.toBeInTheDocument()
  for (const name of [
    messages.ChartStats.all,
    messages.ChartStats.outward,
    messages.ChartStats.inward,
    'Pending',
    'Cleared',
    'Customer',
    'Supplier',
    'Vendor',
    'Unclassified',
  ]) {
    for (const pill of screen.getAllByRole('button', { name })) {
      expect(pill.querySelector('svg')).not.toBeNull()
    }
  }
})

it('scales the amount slider to the highest cheque in about 100 stops', () => {
  expect(amountSliderScale(125_000)).toEqual({ step: 1000, max: 125_000 })
  expect(amountSliderScale(123_456)).toEqual({ step: 1000, max: 124_000 })
  expect(amountSliderScale(42)).toEqual({ step: 1, max: 42 })
})

it('drives min and max amount from the two-thumb slider and the inputs', () => {
  render(<Harness initial="max_amount=50000" />)
  const [low, high] = screen.getAllByRole('slider', { hidden: true })
  expect(low).toHaveAttribute('aria-label', 'Minimum amount')
  expect(high).toHaveAttribute('aria-label', 'Maximum amount')
  expect(high).toHaveAttribute('aria-valuenow', '50000')
  fireEvent.keyDown(low, { key: 'ArrowRight' })
  expect(screen.getByTestId('query')).toHaveTextContent(
    'max_amount=50000&min_amount=1000',
  )
  fireEvent.keyDown(high, { key: 'End' })
  expect(screen.getByTestId('query')).toHaveTextContent('min_amount=1000')
  expect(screen.getByTestId('query')).not.toHaveTextContent('max_amount')
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum amount' }), {
    target: { value: '2000' },
  })
  expect(screen.getAllByRole('slider', { hidden: true })[1]).toHaveAttribute(
    'aria-valuenow',
    '2000',
  )
})

it('falls back to amount inputs when the business has no cheques yet', () => {
  bounds.data = { min: 0, max: 0 }
  render(<Harness />)
  expect(screen.queryByRole('slider', { hidden: true })).not.toBeInTheDocument()
  expect(
    screen.getByRole('spinbutton', { name: 'Minimum amount' }),
  ).toBeVisible()
})

it('uses exact cheque minimum and maximum amounts, including decimal bounds', () => {
  bounds.data = { min: 125.25, max: 123456.75 }
  render(<Harness />)
  const [low, high] = screen.getAllByRole('slider', { hidden: true })
  expect(low).toHaveAttribute('min', '125.25')
  expect(high).toHaveAttribute('max', '123456.75')
  expect(low).toHaveAttribute('aria-valuenow', '125.25')
  expect(high).toHaveAttribute('aria-valuenow', '123456.75')
  const input = screen.getByRole('spinbutton', { name: 'Minimum amount' })
  expect(input).toHaveAttribute('min', '0')
  expect(input).toHaveAttribute('step', 'any')
  fireEvent.change(input, { target: { value: 'letters' } })
  expect(input).toHaveValue(null)
})

it('combines live status, single party type, decimal bounds and removable bank selections', () => {
  const onValidityChange = vi.fn()
  function Filters() {
    const [params, setParams] = useState(new URLSearchParams())
    return (
      <>
        <AdvancedChequeFilters
          params={params}
          onValidityChange={onValidityChange}
          onClear={() => setParams(new URLSearchParams())}
          onChange={(key, value) =>
            setParams((previous) => {
              const next = new URLSearchParams(previous)
              if (value) next.set(key, value)
              else next.delete(key)
              return next
            })
          }
        />
        <output data-testid="query">{params.toString()}</output>
        <output data-testid="valid">
          {String(parseChequeListUrl(params).success)}
        </output>
      </>
    )
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Filters />
    </NextIntlClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Pending' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cleared' }))
  fireEvent.click(
    screen.getByRole('button', { name: messages.ChartStats.outward }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'Customer' }))
  fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
  expect(screen.getByRole('button', { name: 'Customer' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Minimum amount' }), {
    target: { value: '100.25' },
  })
  fireEvent.change(screen.getByLabelText('Bank'), { target: { value: bank } })
  const params = new URLSearchParams(screen.getByTestId('query').textContent!)
  expect(parseChequeListUrl(params)).toMatchObject({
    success: true,
    filters: {
      type: 'Outward',
      statuses: ['Issued', 'Received', 'Cleared'],
      party_type: 'supplier',
      min_amount: 100.25,
      bank_ids: [bank],
    },
  })
  fireEvent.click(
    screen.getByRole('button', { name: 'Remove Custom Bank filter' }),
  )
  expect(screen.getByTestId('query')).not.toHaveTextContent('bank_ids')
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Maximum amount' }), {
    target: { value: '99' },
  })
  expect(screen.getByTestId('valid')).toHaveTextContent('false')
  fireEvent.change(screen.getByLabelText('Cheque date from'), {
    target: { value: 'not-a-date' },
  })
  expect(screen.getByRole('alert')).toBeVisible()
  expect(onValidityChange).toHaveBeenCalledWith('from', false)
  fireEvent.click(
    screen.getByRole('button', { name: messages.Common.clearAllFilters }),
  )
  expect(screen.getByTestId('query')).toBeEmptyDOMElement()
})
