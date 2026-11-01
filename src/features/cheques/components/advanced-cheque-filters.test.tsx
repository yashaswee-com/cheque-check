import { useState } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { AdvancedChequeFilters } from './advanced-cheque-filters'
import { parseChequeListUrl } from '@/validators/cheque-list-filters'

const bank = '10000000-0000-4000-8000-000000000001'
vi.mock('@/features/accounts/hooks/use-banks', () => ({
  useBanks: () => ({
    data: [{ id: bank, name: 'Custom Bank', abbreviation: 'CB' }],
  }),
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
afterEach(cleanup)

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
  fireEvent.change(screen.getByLabelText('Minimum amount'), {
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
  fireEvent.change(screen.getByLabelText('Maximum amount'), {
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
