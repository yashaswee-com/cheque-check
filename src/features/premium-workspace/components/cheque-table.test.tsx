import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChequeRow } from '../types'
import { ChequeTable } from './cheque-table'

vi.mock('next-intl', () => ({
  useLocale: () => 'en-US',
  useTranslations: () => (key: string) => key,
}))

afterEach(cleanup)

const cheque: ChequeRow = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '123456',
  amount: 125,
  cheque_date: '2026-10-31',
  deposit_date: null,
  type: 'Outward',
  status: 'Issued',
  notes: null,
  image_url: null,
  is_draft: false,
  remind_before_days: null,
  created_at: null,
  updated_at: null,
  deleted_at: null,
  deletion_batch_id: null,
}

it('shows the empty state when no cheque rows are available', () => {
  render(<ChequeTable cheques={[]} currency="₹" />)
  expect(screen.getByText('empty')).toBeInTheDocument()
})

it('renders optional values and selection controls without a selected list', () => {
  const onSelect = vi.fn()
  render(
    <ChequeTable
      cheques={[
        {
          ...cheque,
          amount: null,
          cheque_number: null,
          type: null,
          status: null,
        },
      ]}
      onSelect={onSelect}
      currency="₹"
    />,
  )

  const checkbox = screen.getByRole('checkbox', { name: 'selectCheque' })
  expect(checkbox).not.toBeChecked()
  fireEvent.click(checkbox)
  expect(onSelect).toHaveBeenCalledWith('c1')
  expect(screen.getByRole('link')).toHaveAttribute('href', '/cheques/c1')
  expect(screen.getByRole('table')).toHaveTextContent('₹0.00')
})

it('marks rows whose identifiers are in the selected list', () => {
  render(
    <ChequeTable
      cheques={[cheque]}
      selected={['c1']}
      onSelect={vi.fn()}
      currency="₹"
    />,
  )
  expect(screen.getByRole('checkbox', { name: 'selectCheque' })).toBeChecked()
})
