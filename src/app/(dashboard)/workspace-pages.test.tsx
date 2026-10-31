import { lazy, Suspense, useState, type ReactNode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import DashboardPage from './dashboard/page'
import ReportsPage from './reports/page'
import ProfilePage from './profile/page'
import BusinessesPage from './businesses/page'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  deleteProfile: vi.fn(),
  deleteBusiness: vi.fn(),
  activate: vi.fn(),
  status: vi.fn(),
  push: vi.fn(),
  scan: vi.fn(),
  toast: vi.fn(),
  verify: vi.fn(),
  csv: vi.fn(),
  json: vi.fn(),
  pdf: vi.fn(),
  excel: vi.fn(),
}))
const business = { id: 'business', name: 'Acme', email: 'acme@example.test' }
const baseCheque = {
  id: 'cheque',
  party: { name: 'Customer' },
  cheque_number: '100123',
  cheque_date: '2026-10-31',
  status: 'Received',
  amount: 500,
}
let cheques = [baseCheque]
let loading = false
let active = true
let empty = false
let noResults = false
let balance = -100
let profile = {
  id: 'profile',
  name: 'Original Person',
  email: 'person@example.test',
  avatar_url: null as string | null,
  currency: '$',
}
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<React.ComponentType>) => {
    const Component = lazy(async () => ({ default: await load() }))
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Component {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: active ? business : null }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile,
    isLoading: loading,
    updateProfile: mocks.update,
  }),
}))
vi.mock('@/features/settings/hooks/use-settings', () => ({
  useSettings: () => ({ handleDeleteProfile: mocks.deleteProfile }),
}))
vi.mock('@/features/businesses/hooks/use-businesses-page', () => ({
  useBusinesses: () => {
    const [search, setSearch] = useState('')
    const [sortBy, setSortBy] = useState('name')
    const [sortOrder, setSortOrder] = useState('asc')
    return {
      businesses: empty ? [] : [business],
      filteredBusinesses: empty || noResults ? [] : [business],
      isLoading: loading,
      activeBusiness: active ? business : null,
      setActiveBusiness: mocks.activate,
      search,
      setSearch,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      getUpcomingTotal: () => 1200,
      deleteBusiness: mocks.deleteBusiness,
    }
  },
}))
vi.mock('@/features/cheques/hooks/use-cheques', () => ({
  useCheques: () => ({
    cheques,
    isLoading: loading,
    updateStatus: mocks.status,
  }),
}))
vi.mock('@/features/cheques/hooks/use-cheque-stats', () => ({
  useChequeStats: () => ({
    todayCheques: cheques,
    payable: 600,
    receivable: 500,
    currentBalance: balance,
    upcomingCount: 2,
    overdueCount: 1,
    outstanding: 1100,
  }),
}))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagMap: () => ({ cheque: [], business: [] }),
}))
vi.mock('@/features/tags/components/tag-chips', () => ({
  TagChips: () => <span>Business tags</span>,
}))
vi.mock('@/features/premium-workspace/components/native-tools', () => ({
  NativeTools: () => <span>Workspace tools</span>,
}))
vi.mock('@/features/drafts', () => ({
  DraftsSummaryCard: () => <span>Draft summary</span>,
}))
vi.mock('@/features/cheques/components/cheque-distribution', () => ({
  ChequeDistribution: ({ cheques: rows }: { cheques: unknown[] }) => (
    <span>Chart records: {rows.length}</span>
  ),
}))
vi.mock('@/features/cheques/components/stats-date-filter', () => ({
  StatsDateFilter: ({
    onPresetChange,
  }: {
    onPresetChange: (preset: string) => void
  }) => (
    <button onClick={() => onPresetChange('thisMonth')}>Today chart</button>
  ),
}))
vi.mock('@/lib/scan-store', () => ({ ScanStore: { setFile: mocks.scan } }))
vi.mock('@/components/cheque-card', () => ({
  ChequeCard: ({
    cheque,
    onStatusUpdate,
  }: {
    cheque: typeof baseCheque
    onStatusUpdate: (id: string, status: string) => void
  }) => (
    <button onClick={() => onStatusUpdate(cheque.id, 'Cleared')}>
      Clear {cheque.cheque_number}
    </button>
  ),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  PremiumGate: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePremiumAction: () => ({ verifyAccess: mocks.verify }),
}))
vi.mock('@/features/reports/services/report.service', () => ({
  reportService: {
    exportToCSV: mocks.csv,
    exportToJSON: mocks.json,
    exportToPDF: mocks.pdf,
    exportToExcel: mocks.excel,
  },
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/lib/env/client', () => ({
  publicEnv: { NEXT_PUBLIC_PHONE_AUTH_ENABLED: 'true' },
}))
vi.mock('@/features/auth/components/login-phone-section', () => ({
  LoginPhoneSection: () => <span>Login phone settings</span>,
}))
vi.mock('@/components/ui/editable-avatar', () => ({
  EditableAvatar: ({
    onUpload,
    onDelete,
  }: {
    onUpload: (url: string) => void
    onDelete: () => void
  }) => (
    <div>
      <button onClick={() => onUpload('new-avatar')}>Upload avatar</button>
      <button onClick={onDelete}>Remove avatar</button>
    </div>
  ),
}))
vi.mock('@/components/ui/delete-dialog', () => ({
  DeleteConfirmationDialog: ({
    onDelete,
    confirmName,
  }: {
    onDelete: () => void
    confirmName: string
  }) => (
    <button type="button" onClick={onDelete}>
      Confirm {confirmName}
    </button>
  ),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTrigger: () => null,
  SheetContent: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))
function renderPage(page: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {page}
    </NextIntlClientProvider>,
  )
}
beforeEach(() => {
  vi.resetAllMocks()
  loading = empty = noResults = false
  active = true
  balance = -100
  cheques = [baseCheque]
  profile = {
    id: 'profile',
    name: 'Original Person',
    email: 'person@example.test',
    avatar_url: null,
    currency: '$',
  }
  mocks.update.mockResolvedValue(undefined)
  mocks.verify.mockResolvedValue(true)
})
afterEach(cleanup)

describe('dashboard page', () => {
  it.each([true, false])(
    'shows loading or first-business onboarding (%s)',
    (pending) => {
      loading = pending
      active = false
      const { container } = renderPage(<DashboardPage />)
      expect(
        screen.queryByTestId('dashboard-current-balance'),
      ).not.toBeInTheDocument()
      if (pending)
        expect(
          container.querySelector('[data-slot="skeleton"]'),
        ).toBeInTheDocument()
      else
        expect(
          document.querySelector('a[href="/businesses/create"]'),
        ).toBeInTheDocument()
    },
  )
  it.each([-100, 200, 0])(
    'formats net balance %s and connects cheque status updates',
    (net) => {
      balance = net
      renderPage(<DashboardPage />)
      expect(screen.getByTestId('dashboard-current-balance')).toHaveTextContent(
        net < 0 ? '-$100' : `$${net}`,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Clear 100123' }))
      expect(mocks.status).toHaveBeenCalledWith('cheque', 'Cleared')
    },
  )
  it('stores a scan locally before navigating to cheque creation', async () => {
    const { container } = renderPage(<DashboardPage />)
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [] } })
    expect(mocks.scan).not.toHaveBeenCalled()
    const file = new File(['scan'], 'scan.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith('/cheques/create?action=scan'),
    )
    expect(mocks.scan).toHaveBeenCalledWith(file)
  })
  it('shows the no-cheques-today explanation and allows changing chart date range', async () => {
    cheques = []
    renderPage(<DashboardPage />)
    expect(
      screen.getByText(messages.Dashboard.noChequesTodayTitle),
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Today chart' }))
    expect(await screen.findByText('Chart records: 0')).toBeVisible()
  })
})

describe('reports page', () => {
  it.each(['csv', 'json', 'pdf', 'excel'] as const)(
    'exports %s using the active business name',
    async (format) => {
      renderPage(<ReportsPage />)
      fireEvent.click(screen.getByTestId('reports-export-trigger'))
      fireEvent.click(await screen.findByTestId(`reports-export-${format}`))
      const service = mocks[format]
      await waitFor(() =>
        expect(service).toHaveBeenCalledWith(
          cheques,
          `cheques_report_Acme.${format === 'excel' ? 'xlsx' : format}`,
        ),
      )
      expect(mocks.verify).toHaveBeenCalledWith('reports')
      await waitFor(() =>
        expect(
          screen.queryByTestId(`reports-export-${format}`),
        ).not.toBeInTheDocument(),
      )
    },
  )
  it('blocks export after entitlement verification fails', async () => {
    mocks.verify.mockResolvedValue(false)
    renderPage(<ReportsPage />)
    fireEvent.click(screen.getByTestId('reports-export-trigger'))
    fireEvent.click(await screen.findByTestId('reports-export-csv'))
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledOnce())
    expect(mocks.csv).not.toHaveBeenCalled()
  })
  it('reports export exceptions and leaves format selection available for retry', async () => {
    mocks.csv.mockImplementationOnce(() => {
      throw new Error('Export failed')
    })
    renderPage(<ReportsPage />)
    fireEvent.click(screen.getByTestId('reports-export-trigger'))
    fireEvent.click(await screen.findByTestId('reports-export-csv'))
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Export failed',
          type: 'error',
        }),
      ),
    )
    expect(screen.getByTestId('reports-export-csv')).toBeVisible()
  })
  it('limits recent records to ten and explains the total count', () => {
    cheques = Array.from({ length: 12 }, (_, index) => ({
      ...baseCheque,
      id: `cheque-${index}`,
      cheque_number: `${100000 + index}`,
    }))
    renderPage(<ReportsPage />)
    expect(screen.getAllByText('Customer')).toHaveLength(10)
    expect(
      screen.getByText(
        messages.Reports.showingCheques.replace('{count}', '12'),
      ),
    ).toBeVisible()
    expect(screen.getByText('$1,100')).toBeVisible()
  })
  it('disables exports for an empty history and prompts business creation if needed', () => {
    cheques = []
    renderPage(<ReportsPage />)
    expect(screen.getByTestId('reports-export-trigger')).toBeDisabled()
    expect(screen.getByText(messages.Reports.noChequesYet)).toBeVisible()
    cleanup()
    active = false
    renderPage(<ReportsPage />)
    expect(
      document.querySelector('a[href="/businesses/create"]'),
    ).toBeInTheDocument()
  })
})

describe('profile page', () => {
  it('shows loading placeholders and makes the email read-only', () => {
    loading = true
    renderPage(<ProfilePage />)
    expect(
      screen.queryByLabelText(messages.Settings.fullName),
    ).not.toBeInTheDocument()
    cleanup()
    loading = false
    renderPage(<ProfilePage />)
    expect(screen.getByLabelText(messages.Common.email)).toBeDisabled()
    expect(screen.getByLabelText(messages.Common.email)).toHaveValue(
      'person@example.test',
    )
    expect(screen.getByText('Login phone settings')).toBeVisible()
  })
  it('rejects unchanged and empty names then trims valid changes before saving', async () => {
    renderPage(<ProfilePage />)
    const name = screen.getByLabelText(messages.Settings.fullName)
    expect(
      screen.getByRole('button', { name: messages.Settings.saveProfile }),
    ).toBeDisabled()
    fireEvent.change(name, { target: { value: '   ' } })
    expect(
      screen.getByRole('button', { name: messages.Settings.saveProfile }),
    ).toBeDisabled()
    fireEvent.change(name, { target: { value: '  Revised Person  ' } })
    fireEvent.click(
      screen.getByRole('button', { name: messages.Settings.saveProfile }),
    )
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ name: 'Revised Person' }),
    )
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.Settings.profileUpdated,
      type: 'success',
    })
  })
  it('retains entered name on save failure and permits retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('Offline'))
    renderPage(<ProfilePage />)
    fireEvent.change(screen.getByLabelText(messages.Settings.fullName), {
      target: { value: 'Revised' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: messages.Settings.saveProfile }),
    )
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        title: messages.Settings.profileUpdateFailed,
        type: 'error',
      }),
    )
    expect(screen.getByLabelText(messages.Settings.fullName)).toHaveValue(
      'Revised',
    )
    expect(
      screen.getByRole('button', { name: messages.Settings.saveProfile }),
    ).toBeEnabled()
  })
  it('updates avatars and invokes profile deletion only from confirmation', async () => {
    renderPage(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Upload avatar' }))
    expect(mocks.update).toHaveBeenCalledWith({ avatar_url: 'new-avatar' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove avatar' }))
    expect(mocks.update).toHaveBeenCalledWith({ avatar_url: null })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm Original Person' }),
    )
    expect(mocks.deleteProfile).toHaveBeenCalledOnce()
  })
})

describe('business list page', () => {
  it('renders business totals, activates a card, and isolates detail navigation from activation', () => {
    renderPage(<BusinessesPage />)
    expect(screen.getByText('$1,200')).toBeVisible()
    fireEvent.click(screen.getByTestId('business-card-business'))
    expect(mocks.activate).toHaveBeenCalledWith(business)
    mocks.activate.mockClear()
    const detail = screen.getByTestId('business-detail-link')
    expect(detail).toHaveAttribute('href', '/businesses/business')
    detail.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(detail)
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it('connects search and sort controls and resets a search with no matching records', () => {
    noResults = true
    renderPage(<BusinessesPage />)
    const search = screen.getByPlaceholderText(
      messages.Businesses.searchPlaceholder,
    )
    fireEvent.change(search, { target: { value: 'Missing' } })
    fireEvent.click(
      screen.getByRole('button', { name: messages.Businesses.sortByUpcoming }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.descending }),
    )
    expect(search).toHaveValue('Missing')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.clearAllFilters }),
    )
    expect(search).toHaveValue('')
  })
  it('deletes only the confirmed business without activating it', async () => {
    renderPage(<BusinessesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm Acme' }))
    expect(mocks.deleteBusiness).toHaveBeenCalledWith('business')
    expect(mocks.activate).not.toHaveBeenCalled()
  })
  it.each(['empty', 'loading'])(
    'shows %s state without business cards',
    (state) => {
      empty = state === 'empty'
      loading = state === 'loading'
      renderPage(<BusinessesPage />)
      expect(
        screen.queryByTestId('business-card-business'),
      ).not.toBeInTheDocument()
      if (state === 'empty')
        expect(
          document.querySelector('a[href="/businesses/create"]'),
        ).toBeInTheDocument()
    },
  )
})
