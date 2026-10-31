import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import type { ChequeWithRelations } from '@/types'
import { ChequeDistribution } from './cheque-distribution'

vi.mock('./cheque-stats-chart', () => ({
  ChequeStatsChart: ({ totalLabel }: { totalLabel: string }) => (
    <p data-testid="chart-total">{totalLabel}</p>
  ),
}))

afterEach(cleanup)

function renderChart(cheques: ChequeWithRelations[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChequeDistribution cheques={cheques} currency="₹" />
    </NextIntlClientProvider>,
  )
}

const row = (
  id: string,
  status: ChequeWithRelations['status'],
  type: ChequeWithRelations['type'],
  amount: number,
): ChequeWithRelations => ({
  id,
  status,
  type,
  amount,
  business_id: 'business',
  party_id: 'party',
  account_id: 'account',
  cheque_number: id,
  cheque_date: '2026-10-21',
  deposit_date: null,
  remind_before_days: null,
  notes: null,
  image_url: null,
  created_at: '',
  updated_at: '',
})

describe('ChequeDistribution', () => {
  it('uses exact server aggregates for count, amount and direction', () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChequeDistribution
          currency="₹"
          summary={[
            {
              status: 'Issued',
              type: 'Outward',
              cheque_count: 10000,
              total_amount: 15000,
              today_count: 0,
              upcoming_count: 10000,
              overdue_count: 0,
            },
            {
              status: 'Cleared',
              type: 'Inward',
              cheque_count: 1,
              total_amount: 300,
              today_count: 0,
              upcoming_count: 0,
              overdue_count: 0,
            },
          ]}
        />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('chart-total')).toHaveTextContent('10,001')
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'amount' },
    })
    expect(screen.getByTestId('chart-total')).toHaveTextContent('₹15,300')
    fireEvent.change(screen.getByLabelText('Direction'), {
      target: { value: 'Inward' },
    })
    expect(screen.getByTestId('chart-total')).toHaveTextContent('₹300')
    expect(screen.getByRole('status')).toHaveTextContent('All cheques cleared')
  })
  it('switches count/amount and direction without overlapping slices', () => {
    renderChart([
      row('1', 'Issued', 'Outward', 100),
      row('2', 'Cleared', 'Inward', 300),
    ])
    expect(screen.getByTestId('chart-total')).toHaveTextContent('2')
    expect(screen.getByRole('list')).toHaveTextContent('Issued: 1 (50.0%)')
    fireEvent.change(screen.getByLabelText('Measure'), {
      target: { value: 'amount' },
    })
    expect(screen.getByTestId('chart-total')).toHaveTextContent('₹400')
    expect(screen.getByRole('list')).toHaveTextContent('Cleared: ₹300 (75.0%)')
    fireEvent.change(screen.getByLabelText('Direction'), {
      target: { value: 'Inward' },
    })
    expect(screen.getByTestId('chart-total')).toHaveTextContent('₹300')
    expect(screen.getByRole('status')).toHaveTextContent('All cheques cleared')
  })

  it('does not call bounced-only or empty data all cleared', () => {
    const { unmount } = renderChart([row('1', 'Bounced', 'Outward', 100)])
    expect(screen.getByRole('status')).toHaveTextContent('No pending cheques')
    unmount()
    renderChart([])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('list')).not.toHaveTextContent('NaN')
  })
})
