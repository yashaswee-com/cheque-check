import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import messages from '../../../../messages/en.json'
import { ChequeFilterBar } from './cheque-filter-bar'
import { StatsDateFilter } from './stats-date-filter'
import { ChequeStatsChart } from './cheque-stats-chart'
import type { DateRange } from 'react-day-picker'
import type { DateRangePreset } from '../lib/date-range'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: ({ fill }: { fill: string }) => (
    <span data-testid="slice" style={{ color: fill }} />
  ),
  Tooltip: ({ formatter }: { formatter: (value: number) => string }) => (
    <output>{formatter(25)}</output>
  ),
  Legend: ({
    formatter,
  }: {
    formatter: (value: string) => React.ReactNode
  }) => <div>{formatter('Issued')}</div>,
}))
afterEach(cleanup)
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )

it('routes search and every sorting and filtering action to its controlled setter', async () => {
  const search = vi.fn(),
    filter = vi.fn(),
    sort = vi.fn(),
    order = vi.fn()
  wrap(
    <ChequeFilterBar
      search=""
      setSearch={search}
      filter="All"
      setFilter={filter}
      sortBy="date"
      setSortBy={sort}
      sortOrder="desc"
      setSortOrder={order}
    />,
  )
  fireEvent.change(screen.getByTestId('cheque-search-input'), {
    target: { value: '123' },
  })
  expect(search).toHaveBeenCalledWith('123')
  fireEvent.click(screen.getByTestId('cheque-filter-trigger'))
  await screen.findByRole('dialog')
  for (const status of ['all', 'issued', 'received', 'cleared', 'bounced'])
    fireEvent.click(screen.getByTestId(`cheque-filter-status-${status}`))
  expect(filter).toHaveBeenLastCalledWith('Bounced')
  fireEvent.click(screen.getByTestId('cheque-sort-by-amount'))
  fireEvent.click(screen.getByTestId('cheque-sort-order-asc'))
  expect(sort).toHaveBeenCalledWith('amount')
  expect(order).toHaveBeenCalledWith('asc')
})

it('renders empty statistics and formats chart values, percentages and legend labels', () => {
  const { unmount } = wrap(<ChequeStatsChart chartData={[]} totalCheques={0} />)
  expect(screen.getByText(messages.Common.noData)).toBeInTheDocument()
  unmount()
  wrap(
    <ChequeStatsChart
      chartData={[{ name: 'Issued', value: 100, color: '#ff0000' }]}
      totalCheques={4}
    />,
  )
  expect(screen.getByText('25 (25.0%)')).toBeInTheDocument()
  expect(screen.getByText('Issued')).toBeInTheDocument()
  expect(screen.getByText('4')).toBeInTheDocument()
})

it('changes date presets, opens a custom calendar and selects dates', async () => {
  const user = userEvent.setup()
  function Filter() {
    const [preset, setPreset] = useState<DateRangePreset>('all')
    const [range, setRange] = useState<DateRange>()
    return (
      <StatsDateFilter
        preset={preset}
        onPresetChange={setPreset}
        customRange={range}
        onCustomRangeChange={setRange}
      />
    )
  }
  wrap(<Filter />)
  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByRole('option', { name: 'Custom range' }))
  const day = (await screen.findAllByRole('button')).find((button) =>
    button.getAttribute('data-day'),
  )
  expect(day).toBeDefined()
  fireEvent.click(day!)
  expect(screen.getByRole('combobox')).toHaveTextContent('Custom range')
})

it('labels an explicit custom date interval', () => {
  wrap(
    <StatsDateFilter
      preset="custom"
      customRange={{ from: new Date(2026, 0, 1), to: new Date(2026, 0, 3) }}
      onPresetChange={vi.fn()}
      onCustomRangeChange={vi.fn()}
    />,
  )
  expect(
    screen.getByRole('button', { name: '1 Jan – 3 Jan 26' }),
  ).toBeInTheDocument()
})
