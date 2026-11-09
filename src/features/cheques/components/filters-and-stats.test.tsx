import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import messages from '../../../../messages/en.json'
import { ChequeFilterBar } from './cheque-filter-bar'
import { expectHorizontalPillRows } from '@/test/pill-rows'
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
  expectHorizontalPillRows([
    messages.Common.sortBy,
    messages.Common.order,
    messages.Cheques.filterStatus,
  ])
  expect(screen.getByTestId('cheque-filter-status-all')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.getByTestId('cheque-filter-status-bounced')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  for (const status of ['all', 'issued', 'received', 'cleared', 'bounced'])
    fireEvent.click(screen.getByTestId(`cheque-filter-status-${status}`))
  expect(filter).toHaveBeenLastCalledWith('Bounced')
  fireEvent.click(screen.getByTestId('cheque-sort-by-amount'))
  fireEvent.click(screen.getByTestId('cheque-sort-order-asc'))
  expect(sort).toHaveBeenCalledWith('amount')
  expect(order).toHaveBeenCalledWith('asc')
})

it('shows icons for every cheque search sort and status option', async () => {
  wrap(
    <ChequeFilterBar
      search=""
      setSearch={vi.fn()}
      filter="All"
      setFilter={vi.fn()}
      sortBy="date"
      setSortBy={vi.fn()}
      sortOrder="desc"
      setSortOrder={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByTestId('cheque-filter-trigger'))
  await screen.findByRole('dialog')

  for (const section of [
    messages.Common.sortBy,
    messages.Common.order,
    messages.Cheques.filterStatus,
  ]) {
    const options = within(
      screen.getByRole('group', { name: section }),
    ).getAllByRole('button')
    for (const option of options) {
      expect(option.querySelector('svg')).toBeInTheDocument()
    }
  }
})

it('marks a non-default filter selection on the trigger', () => {
  wrap(
    <ChequeFilterBar
      search="123"
      setSearch={vi.fn()}
      filter="Issued"
      setFilter={vi.fn()}
      sortBy="date"
      setSortBy={vi.fn()}
      sortOrder="desc"
      setSortOrder={vi.fn()}
    />,
  )
  expect(screen.getByTestId('cheque-filter-trigger')).toHaveClass('bg-primary')
  expect(screen.getByTestId('cheque-filter-trigger')).not.toHaveClass(
    'bg-white',
  )
})

it('renders empty statistics and formats chart values, percentages and legend labels', () => {
  const { unmount } = wrap(<ChequeStatsChart chartData={[]} totalCheques={0} />)
  expect(screen.getByText(messages.Common.noData)).toBeInTheDocument()
  unmount()
  wrap(
    <ChequeStatsChart
      chartData={[
        { name: 'Issued', value: 100, color: '#ff0000' },
        { name: 'Cleared', value: 50, color: '#00ff00' },
      ]}
      totalCheques={4}
    />,
  )
  expect(screen.getByText('25 (16.7%)')).toBeInTheDocument()
  expect(screen.getByText('Issued')).toBeInTheDocument()
  expect(screen.getAllByTestId('slice')).toHaveLength(2)
  expect(screen.getByText('4')).toBeInTheDocument()
})

it('formats a single zero-valued chart slice without dividing by zero', () => {
  wrap(
    <ChequeStatsChart
      chartData={[{ name: 'Issued', value: 0, color: '#ff0000' }]}
      totalCheques={0}
    />,
  )
  expect(screen.getByText('25 (0.0%)')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
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
  await user.click(screen.getByRole('button', { name: 'Custom range' }))
  const day = (await screen.findAllByRole('button')).find((button) =>
    button.getAttribute('data-day'),
  )
  expect(day).toBeDefined()
  fireEvent.click(day!)
  expect(screen.getByRole('button', { name: 'Custom range' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('does not open a calendar for a non-custom date preset', async () => {
  const user = userEvent.setup()
  const onPresetChange = vi.fn()
  wrap(
    <StatsDateFilter
      preset="all"
      customRange={undefined}
      onPresetChange={onPresetChange}
      onCustomRangeChange={vi.fn()}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'This week' }))
  expect(onPresetChange).toHaveBeenCalledWith('thisWeek')
  expect(
    screen.queryByRole('button', { name: 'Pick dates' }),
  ).not.toBeInTheDocument()
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
    screen.getByRole('button', { name: '01/01/2026 – 03/01/2026' }),
  ).toBeInTheDocument()
  const datePill = screen.getByRole('button', {
    name: '01/01/2026 – 03/01/2026',
  })
  expect(datePill).toHaveClass('whitespace-nowrap', 'shrink-0')
  const row = screen.getByRole('group', {
    name: messages.Dashboard.dateRange.label,
  })
  expect(row).toHaveClass('overflow-x-auto', 'flex-nowrap')
  expect(datePill.closest('[data-slot="pill-scroller"]')).toBe(row)
  expect(
    screen.getByRole('button', { name: 'Custom range' }).nextElementSibling,
  ).toBe(datePill)
})

it('labels a custom date range while its end date is not selected', () => {
  wrap(
    <StatsDateFilter
      preset="custom"
      customRange={{ from: new Date(2026, 0, 1) }}
      onPresetChange={vi.fn()}
      onCustomRangeChange={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: '01/01/2026' })).toBeInTheDocument()
})
