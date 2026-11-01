import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { ChequeAnalytics } from './cheque-analytics'
import type { ChequeAnalytics as AnalyticsData } from '@/validators/cheque-analytics'
const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  includeInward: true,
  loading: false,
  error: null as Error | null,
}))
vi.mock('@/features/cheques/hooks/use-cheque-analytics', () => ({
  useChequeAnalytics: (...args: unknown[]) => {
    mocks.hook(...args)
    return { data, isFetching: mocks.loading, error: mocks.error }
  },
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { received_cheques_enabled: mocks.includeInward, currency: '$' },
  }),
}))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
}))
const data: AnalyticsData = {
  from: '2026-01-01',
  to: '2026-01-02',
  granularity: 'day',
  matching_banks: 51,
  series: [
    {
      day: '2026-01-01',
      outward_count: 1,
      inward_count: 2,
      outward_amount: 100,
      inward_amount: 300,
    },
  ],
  summary: [
    {
      status: 'Issued',
      type: 'Outward',
      cheque_count: 1,
      total_amount: 100,
      today_count: 1,
      today_amount: 100,
      overdue_count: 0,
      overdue_amount: 0,
    },
  ],
  banks: [
    {
      id: null,
      name: 'Unknown bank',
      metrics: [
        {
          status: 'Issued',
          type: 'Outward',
          cheque_count: 1,
          total_amount: 100,
          today_count: 1,
          today_amount: 100,
          overdue_count: 0,
          overdue_amount: 0,
        },
      ],
    },
  ],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.includeInward = true
  mocks.loading = false
  mocks.error = null
})
afterEach(cleanup)
const range = { from: '2026-01-01', to: '2026-01-02' }
function view(businessId = 'business') {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChequeAnalytics businessId={businessId} range={range} showBankAnalysis />
    </NextIntlClientProvider>
  )
}
it('renders exact accessible count/amount output and drilldowns preserve date and direction', () => {
  render(view())
  expect(screen.getByRole('cell', { name: '$100' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Measure'), {
    target: { value: 'count' },
  })
  expect(screen.getByRole('cell', { name: '1' })).toBeVisible()
  fireEvent.change(screen.getByLabelText('Direction'), {
    target: { value: 'Outward' },
  })
  expect(mocks.hook).toHaveBeenLastCalledWith('business', range, 'Outward', 0)
  const bank = screen.getByRole('link', { name: 'Unknown bank' })
  const params = new URLSearchParams(bank.getAttribute('href')!.split('?')[1])
  expect(Object.fromEntries(params)).toEqual({
    bank_ids: 'unknown',
    ...range,
    type: 'Outward',
  })
  expect(screen.getAllByText('Due today').length).toBeGreaterThan(0)
})
it('pages bank summaries and resets the cursor on business or direction changes', () => {
  const { rerender } = render(view())
  fireEvent.click(
    screen.getByRole('button', { name: messages.SharedUI.nextPage }),
  )
  expect(mocks.hook).toHaveBeenLastCalledWith('business', range, 'All', 50)
  rerender(view('other'))
  expect(mocks.hook).toHaveBeenLastCalledWith('other', range, 'All', 0)
  fireEvent.change(screen.getByLabelText('Direction'), {
    target: { value: 'Inward' },
  })
  expect(mocks.hook).toHaveBeenLastCalledWith('other', range, 'Inward', 0)
})
it('respects inward visibility and keeps selections while loading/errors hide stale data', () => {
  mocks.includeInward = false
  const { rerender } = render(view())
  expect(
    screen.queryByRole('option', { name: messages.ChartStats.inward }),
  ).toBeNull()
  fireEvent.change(screen.getByLabelText('Measure'), {
    target: { value: 'count' },
  })
  mocks.loading = true
  rerender(view())
  expect(screen.getByLabelText('Measure')).toHaveValue('count')
  expect(screen.queryByRole('table')).toBeNull()
  mocks.loading = false
  mocks.error = new Error('Unavailable')
  rerender(view())
  expect(screen.getByRole('alert')).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Unknown bank' })).toBeNull()
})
