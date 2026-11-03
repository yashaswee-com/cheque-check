import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../../messages/en.json'
import JobsPage from './page'
const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  cancel: vi.fn(),
  request: vi.fn(),
  refetch: vi.fn(),
  toast: vi.fn(),
  allowed: true,
  business: 'business',
  error: null as Error | null,
  loading: false,
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: mocks.business ? { id: mocks.business } : undefined,
  }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: null }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  PremiumGate: ({ children }: { children: ReactNode }) =>
    mocks.allowed ? children : <p>Upgrade required</p>,
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/features/reports/hooks/use-export-jobs', () => ({
  useExportJobs: (business: string, request: unknown) => {
    mocks.hook(business, request)
    return {
      data: ['queued', 'processing', 'ready', 'failed', 'expired'].map(
        (status) => ({
          id: status,
          status,
          format: 'csv',
          row_count: 1,
          next_part: 1,
          part_count: 1,
          created_at: '2026-01-01T00:00:00Z',
        }),
      ),
      matchingCount: 101,
      isLoading: mocks.loading,
      isFetching: false,
      error: mocks.error,
      cancel: mocks.cancel,
      request: mocks.request,
      refetch: mocks.refetch,
    }
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.allowed = true
  mocks.business = 'business'
  mocks.error = null
  mocks.loading = false
  mocks.cancel.mockResolvedValue(undefined)
  mocks.request.mockResolvedValue(undefined)
})
afterEach(cleanup)
function mount() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JobsPage />
    </NextIntlClientProvider>,
  )
}
it('pages and filters only the active business history, resetting the page on changes', () => {
  const { rerender } = mount()
  expect(screen.getByTestId('export-jobs-pagination-status')).toHaveTextContent(
    '1 / 3',
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.SharedUI.nextPage }),
  )
  expect(screen.getByTestId('export-jobs-pagination-status')).toHaveTextContent(
    '2 / 3',
  )
  expect(mocks.hook).toHaveBeenLastCalledWith('business', {
    offset: 50,
    limit: 50,
  })
  fireEvent.change(screen.getByLabelText('Job status'), {
    target: { value: 'failed' },
  })
  fireEvent.change(screen.getByLabelText('Export format'), {
    target: { value: 'csv' },
  })
  expect(mocks.hook).toHaveBeenLastCalledWith('business', {
    offset: 0,
    limit: 50,
    status: 'failed',
    format: 'csv',
  })
  fireEvent.click(
    screen.getByRole('button', { name: messages.SharedUI.nextPage }),
  )
  mocks.business = 'other'
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JobsPage />
    </NextIntlClientProvider>,
  )
  expect(mocks.hook).toHaveBeenLastCalledWith('other', {
    offset: 0,
    limit: 50,
    status: 'failed',
    format: 'csv',
  })
})
it('downloads only ready exports, cancels only queued jobs and requests a new failed export', async () => {
  mount()
  const download = screen.getByRole('link', {
    name: messages.Reports.downloadExport,
  })
  expect(download).toHaveAttribute(
    'href',
    '/api/reports/exports/ready/download',
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Reports.cancelExport }),
  )
  await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('queued'))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: messages.Reports.retryExport }),
    ).toBeEnabled(),
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Reports.retryExport }),
  )
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('csv'))
})
it('shows action errors explicitly and does not render rows on loading/fetch failure', async () => {
  mocks.cancel.mockRejectedValue(new Error('Cancellation denied'))
  const { rerender } = mount()
  fireEvent.click(
    screen.getByRole('button', { name: messages.Reports.cancelExport }),
  )
  await waitFor(() =>
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Cancellation denied',
        type: 'error',
      }),
    ),
  )
  mocks.error = new Error('Unavailable')
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <JobsPage />
    </NextIntlClientProvider>,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    messages.Common.loadDataError,
  )
  expect(
    screen.queryByRole('link', { name: messages.Reports.downloadExport }),
  ).toBeNull()
})
it('gates the page before reading history for a free user', () => {
  mocks.allowed = false
  mount()
  expect(screen.getByText('Upgrade required')).toBeVisible()
  expect(mocks.hook).not.toHaveBeenCalled()
})
