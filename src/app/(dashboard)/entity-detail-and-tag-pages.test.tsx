import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { expectHorizontalPillRows } from '@/test/pill-rows'
import AccountDetailPage from './accounts/[id]/page'
import PartyDetailPage from './parties/[id]/page'
import BusinessDetailPage from './businesses/[id]/page'
import CreateTagPage from './tags/create/page'
import EditTagPage from './tags/[id]/edit/page'
import TagDetailPage from './tags/[id]/page'

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  toast: vi.fn(),
}))
const account = {
  id: 'account',
  account_name: 'Operating account',
  account_number: '12345678',
  opening_balance: 2500.5,
  ifsc_code: 'TEST0000001',
  notes: 'Primary account',
  color: '#007AFF',
  bank: { name: 'Example Bank', logo_url: null },
}
const party = {
  id: 'party',
  name: 'Customer One',
  contact: '+919876543210',
  email: 'customer@example.test',
  address: 'Customer address',
  color: '#007AFF',
}
const business = {
  id: 'business',
  name: 'Acme Trading',
  phone: '+919812345678',
  email: 'acme@example.test',
  address: 'Business address',
  color: '#007AFF',
}
const cheque = {
  id: 'cheque',
  cheque_number: '100123',
  amount: 500,
  status: 'Received',
}
let loading = false
let draft = false
let found = true
let empty = false
let noResults = false
let error: Error | null = null
let active = true
let saving = false
let listLoading = false
let links: Array<{
  entity_type: 'cheque' | 'party' | 'account' | 'business'
  entity_id: string
}> = []
let filterState = {
  search: '',
  filter: 'All',
  sortBy: 'date',
  sortOrder: 'desc',
}
let query = new URLSearchParams()
let listCalls: Array<{
  businessId: string | undefined
  filters: Record<string, unknown>
}> = []
let hasContact = true
let profileCurrency: string | null = '$'
let missingAccountBank = false
let missingAccountIfsc = false
let missingTagCollections = false
let deferTagDeleteDialog = false

function useDetail() {
  const [search, setSearch] = useState(filterState.search)
  const [filter, setFilter] = useState(filterState.filter)
  const [sortBy, setSortBy] = useState(filterState.sortBy)
  const [sortOrder, setSortOrder] = useState(filterState.sortOrder)
  useEffect(() => {
    filterState = { search, filter, sortBy, sortOrder }
  }, [search, filter, sortBy, sortOrder])
  return {
    account: found
      ? {
          ...account,
          bank: missingAccountBank ? undefined : account.bank,
          ifsc_code: missingAccountIfsc ? null : account.ifsc_code,
        }
      : null,
    party: found ? { ...party, email: hasContact ? party.email : null } : null,
    business: found
      ? {
          ...business,
          phone: hasContact ? business.phone : null,
          email: hasContact ? business.email : null,
        }
      : null,
    accountCheques: empty ? [] : [cheque],
    partyCheques: empty ? [] : [cheque],
    cheques: empty ? [] : [cheque],
    filteredCheques: empty || noResults ? [] : [cheque],
    stats: { total: 4, totalAmount: 2500, cleared: 1, pending: 2, bounced: 1 },
    outstanding: 500,
    isLoading: loading,
    error,
    search,
    setSearch,
    filter,
    setFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    updateChequeStatus: mocks.status,
    updateStatus: mocks.status,
  }
}
function useListMock(
  businessId: string | undefined,
  filters: Record<string, unknown>,
  controls: {
    search: string
    setSearch: (value: string) => void
    sortBy: string
    setSortBy: (value: string) => void
    sortOrder: string
    setSortOrder: (value: string) => void
  },
) {
  const [filter, setFilter] = useState(filterState.filter)
  useEffect(() => {
    filterState = { ...filterState, filter }
  }, [filter])
  listCalls.push({ businessId, filters })
  return {
    cheques: empty || noResults ? [] : [cheque],
    activeCount: empty ? 0 : 1,
    isLoading: false,
    error,
    ...controls,
    filter,
    setFilter,
    updateStatus: mocks.status,
    pageIndex: 0,
    hasNextPage: false,
    nextPage: vi.fn(),
    previousPage: vi.fn(),
  }
}
vi.mock('@/features/cheques/hooks/use-cheque-list', () => ({
  useChequeList: useListMock,
  useChequeAmountBounds: () => ({ data: { min: 0, max: 0 } }),
}))
vi.mock('@/features/accounts/hooks/use-banks', () => ({
  useBanks: () => ({ data: [], isPending: false, error: null }),
}))
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'entity' }),
  useSearchParams: () => query,
  usePathname: () => '/entity-path',
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    back: mocks.back,
  }),
}))
vi.mock('next/dynamic', () => ({
  default: (
    load: () => Promise<React.ComponentType>,
    options?: { loading?: () => ReactNode },
  ) => {
    const Component = lazy(async () => ({ default: await load() }))
    return function Dynamic(props: Record<string, unknown>) {
      if (deferTagDeleteDialog) return <>{options?.loading?.()}</>
      return (
        <Suspense fallback={<span>Loading widget</span>}>
          <Component {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock('@/features/accounts/hooks/use-account-detail', () => ({
  useAccountDetail: () => useDetail(),
}))
vi.mock('@/features/parties/hooks/use-party-detail', () => ({
  usePartyDetail: () => useDetail(),
}))
vi.mock('@/features/businesses/hooks/use-business-detail', () => ({
  useBusinessDetail: () => useDetail(),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: active ? business : null,
    businesses: [business],
  }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: profileCurrency ? { currency: profileCurrency } : null,
  }),
}))
vi.mock('@/features/drafts', () => ({ useRedirectIfDraft: () => draft }))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagMap: () => ({ cheque: [{ id: 'tag', name: 'Urgent' }] }),
}))
vi.mock('@/features/tags/components/tag-chips', () => ({
  EntityTagsSection: ({
    entityType,
    entityId,
  }: {
    entityType: string
    entityId: string
  }) => (
    <span>
      Tags for {entityType} {entityId}
    </span>
  ),
}))
vi.mock('@/features/premium-workspace/components/native-tools', () => ({
  NativeTools: ({
    destination,
    accountId,
    partyId,
    businessId,
  }: {
    destination: string
    accountId?: string
    partyId?: string
    businessId?: string
  }) => (
    <span>
      Tools: {destination} {accountId ?? partyId ?? businessId}
    </span>
  ),
}))
vi.mock('@/components/cheque-card', () => ({
  ChequeCard: ({
    cheque: row,
    onStatusUpdate,
    tags,
  }: {
    cheque: typeof cheque
    onStatusUpdate: (id: string, status: string) => void
    tags?: Array<{ name: string }>
  }) => (
    <div>
      Cheque {row.cheque_number} {tags?.map((tag) => tag.name).join(', ')}
      <button onClick={() => onStatusUpdate(row.id, 'Cleared')}>
        Clear cheque
      </button>
    </div>
  ),
}))
vi.mock('@/features/cheques/components/cheque-card', () => ({
  ChequeCard: ({ cheque: row }: { cheque: typeof cheque }) => (
    <span>Linked cheque {row.cheque_number}</span>
  ),
}))
vi.mock('@/components/speed-dial-fab', () => ({
  SpeedDialFab: ({
    editHref,
    editLabel,
    actions = [],
  }: {
    editHref: string
    editLabel: string
    actions?: Array<{ label: string; onClick: () => void }>
  }) => (
    <div>
      <a href={editHref}>{editLabel}</a>
      {actions.map((action) => (
        <button key={action.label} onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}))
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open === false ? null : <div>{children}</div>,
  SheetTrigger: () => <span>Filter controls</span>,
  SheetContent: ({
    children,
    ...props
  }: {
    children: ReactNode
    'data-testid'?: string
  }) => (
    <section aria-label="Filters" {...props}>
      {children}
    </section>
  ),
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))
vi.mock('@/features/cheques/components/cheque-filter-bar', () => ({
  ChequeFilterBar: ({
    search,
    setSearch,
    setFilter,
    setSortBy,
    setSortOrder,
    advancedFilters,
  }: {
    search: string
    setSearch: (value: string) => void
    setFilter: (value: string) => void
    setSortBy: (value: string) => void
    setSortOrder: (value: string) => void
    advancedFilters?: ReactNode
  }) => (
    <div>
      <input
        aria-label="Search cheques"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <button onClick={() => setFilter('Cleared')}>Choose cleared</button>
      <button onClick={() => setSortBy('amount')}>Choose amount</button>
      <button onClick={() => setSortOrder('asc')}>Choose ascending</button>
      <section aria-label="Advanced filters">{advancedFilters}</section>
    </div>
  ),
}))
vi.mock('@/features/tags/hooks/use-tags', () => ({
  useTags: () => ({
    tags: [],
    isLoading: loading,
    isCreating: saving,
    isUpdating: saving,
    createTag: mocks.create,
    updateTag: mocks.update,
    deleteTag: mocks.delete,
  }),
}))
vi.mock('@/features/tags/hooks/use-tag-list', () => ({
  useTagDetail: () => ({
    tag: found
      ? { id: 'tag', name: 'Urgent', color: '#007AFF', business_id: 'business' }
      : null,
    links,
    isLoading: loading,
  }),
}))
vi.mock('@/features/cheques/hooks/use-cheques', () => ({
  useCheques: () => ({
    cheques: missingTagCollections
      ? undefined
      : [cheque, { ...cheque, id: 'unlinked' }],
    isLoading: listLoading,
  }),
}))
vi.mock('@/features/parties/hooks/use-parties', () => ({
  useParties: () => ({
    parties: missingTagCollections
      ? undefined
      : [party, { ...party, id: 'unlinked', name: 'Unlinked party' }],
    isLoading: listLoading,
  }),
}))
vi.mock('@/features/accounts/hooks/use-accounts', () => ({
  useAccounts: () => ({
    accounts: missingTagCollections
      ? undefined
      : [
          {
            ...account,
            bank: missingAccountBank ? undefined : account.bank,
          },
        ],
    isLoading: listLoading,
  }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }))
vi.mock('@/components/ui/delete-dialog', () => ({
  DeleteConfirmationDialog: ({
    onDelete,
    trigger,
    open,
  }: {
    onDelete: () => void
    trigger?: ReactNode
    open?: boolean
  }) => (
    <div>
      {trigger}
      {(open === undefined || open) && (
        <button onClick={onDelete}>Confirm deletion</button>
      )}
    </div>
  ),
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
  loading = draft = empty = noResults = saving = listLoading = false
  active = found = hasContact = true
  profileCurrency = '$'
  missingAccountBank = missingAccountIfsc = false
  missingTagCollections = false
  deferTagDeleteDialog = false
  error = null
  filterState = { search: '', filter: 'All', sortBy: 'date', sortOrder: 'desc' }
  query = new URLSearchParams()
  listCalls = []
  links = []
  mocks.create.mockResolvedValue({ id: 'created-tag' })
  mocks.update.mockResolvedValue(undefined)
  mocks.delete.mockResolvedValue(undefined)
})
afterEach(cleanup)

/** The list-level "Clear all filters" action, not the one in the filter sheet. */
function listClearButton() {
  return screen
    .queryAllByRole('button', { name: messages.Common.clearAllFilters })
    .find((button) => !button.closest('section[aria-label="Advanced filters"]'))
}

describe.each([
  {
    kind: 'account',
    Component: AccountDetailPage,
    title: account.account_name,
    notFound: messages.Accounts.notFound,
  },
  {
    kind: 'party',
    Component: PartyDetailPage,
    title: party.name,
    notFound: messages.Parties.notFound,
  },
  {
    kind: 'business',
    Component: BusinessDetailPage,
    title: business.name,
    notFound: messages.Businesses.notFound,
  },
])('$kind detail page', ({ kind, Component, title, notFound }) => {
  it('does not expose details while loading and reports a missing entity', () => {
    loading = true
    const { container } = renderPage(<Component />)
    expect(screen.queryByText(title)).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument()
    cleanup()
    loading = false
    found = false
    renderPage(<Component />)
    expect(screen.getByText(notFound)).toBeVisible()
  })
  it('uses the default currency when profile data is unavailable', () => {
    profileCurrency = null
    renderPage(<Component />)
    expect(
      screen.getByText(
        kind === 'account' ? '₹2,500.50' : kind === 'party' ? '₹500' : '₹2,500',
      ),
    ).toBeVisible()
  })
  it('shows entity data, edit navigation, tags and cheque status actions', () => {
    renderPage(<Component />)
    expect(screen.getByText(title)).toBeVisible()
    expect(screen.getByText(`Tags for ${kind} ${kind}`)).toBeVisible()
    expect(screen.getByRole('link', { name: /Edit/ })).toHaveAttribute(
      'href',
      `/${kind === 'business' ? 'businesses' : kind === 'party' ? 'parties' : 'accounts'}/entity/edit`,
    )
    expect(screen.getByText(/Cheque 100123 Urgent/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear cheque' }))
    expect(mocks.status).toHaveBeenCalledWith('cheque', 'Cleared')
    if (kind === 'account') {
      expect(screen.getByText('12345678')).toBeVisible()
      expect(screen.getByText('TEST0000001')).toBeVisible()
      expect(screen.getByText('$2,500.50')).toBeVisible()
      expect(screen.getByText('Primary account')).toBeVisible()
    } else {
      expect(
        screen.getByText(
          kind === 'party' ? 'Customer address' : 'Business address',
        ),
      ).toBeVisible()
      expect(
        screen.getByText(kind === 'party' ? '$500' : '$2,500'),
      ).toBeVisible()
    }
  })

  it('connects search, sorting and status filters and preserves sorting when filters are cleared', () => {
    noResults = true
    renderPage(<Component />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search cheques' }), {
      target: { value: 'missing' },
    })
    expect(mocks.replace).toHaveBeenLastCalledWith('/entity-path?q=missing', {
      scroll: false,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Choose amount' }))
    expect(mocks.replace).toHaveBeenLastCalledWith('/entity-path?sort=amount', {
      scroll: false,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Choose ascending' }))
    expect(mocks.replace).toHaveBeenLastCalledWith('/entity-path?order=asc', {
      scroll: false,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Choose cleared' }))
    expect(filterState.filter).toBe('Cleared')
    cleanup()
    query = new URLSearchParams(
      'q=missing&sort=amount&order=asc&type=Outward&min_amount=10',
    )
    renderPage(<Component />)
    fireEvent.click(listClearButton()!)
    expect(mocks.replace).toHaveBeenLastCalledWith(
      '/entity-path?sort=amount&order=asc',
      { scroll: false },
    )
  })
  it('queries the shared server-paged cheque list scoped to the entity', () => {
    query = new URLSearchParams('type=Inward&party_type=vendor&min_amount=5')
    renderPage(<Component />)
    const scope =
      kind === 'account'
        ? { account_id: 'entity' }
        : kind === 'party'
          ? { party_id: 'entity' }
          : {}
    expect(listCalls.at(-1)).toEqual({
      businessId: kind === 'business' ? 'entity' : 'business',
      filters: expect.objectContaining({
        type: 'Inward',
        party_type: 'vendor',
        min_amount: 5,
        ...scope,
      }),
    })
  })
  it('offers the same advanced filters as the cheques page', () => {
    renderPage(<Component />)
    const advanced = within(
      screen.getByRole('region', { name: 'Advanced filters' }),
    )
    for (const title of [
      messages.ChartStats.direction,
      messages.Cheques.filterStatus,
      messages.Cheques.partyTypeFilter,
      messages.Cheques.amountRange,
    ])
      expect(advanced.getByText(title)).toBeVisible()
    expect(
      advanced.getByRole('heading', { name: messages.Cheques.bankFilter }),
    ).toBeVisible()
    expect(
      advanced.getByRole('button', { name: messages.Parties.partyTypeVendor }),
    ).toBeVisible()
  })
  it('blocks unfiltered fetches while URL filters are invalid', () => {
    query = new URLSearchParams('min_amount=abc')
    renderPage(<Component />)
    expect(screen.getByText(messages.Cheques.invalidFilters)).toBeVisible()
    expect(listCalls.at(-1)?.businessId).toBeUndefined()
  })
  it('explains an empty cheque history rather than offering filter reset', () => {
    empty = true
    renderPage(<Component />)
    expect(listClearButton()).toBeUndefined()
    expect(
      screen.queryByRole('button', { name: 'Clear cheque' }),
    ).not.toBeInTheDocument()
    if (kind !== 'business')
      expect(
        document.querySelector('a[href="/cheques/create"]'),
      ).toBeInTheDocument()
    else
      expect(screen.getByText(messages.Businesses.noChequesTitle)).toBeVisible()
  })
  if (kind !== 'business')
    it('hides published details while a draft redirect is pending', () => {
      draft = true
      renderPage(<Component />)
      expect(screen.queryByText(title)).not.toBeInTheDocument()
    })
  if (kind !== 'account') {
    it('opens phone and email actions locally without contacting a service', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null)
      renderPage(<Component />)
      fireEvent.click(
        screen.getByRole('button', { name: messages.Common.contact }),
      )
      fireEvent.click(
        screen.getByRole('button', { name: messages.Common.email }),
      )
      expect(open).toHaveBeenCalledWith(
        `tel:${kind === 'party' ? party.contact : business.phone}`,
        '_self',
      )
      expect(open).toHaveBeenCalledWith(
        `mailto:${kind === 'party' ? party.email : business.email}`,
        '_self',
      )
      open.mockRestore()
    })
    it('omits unavailable contact actions', () => {
      hasContact = false
      renderPage(<Component />)
      expect(
        screen.queryByRole('button', { name: messages.Common.email }),
      ).not.toBeInTheDocument()
      if (kind === 'business')
        expect(
          screen.queryByRole('button', { name: messages.Common.contact }),
        ).not.toBeInTheDocument()
    })
  }
})

it('shows safe account fallbacks when optional bank details are absent', () => {
  missingAccountBank = missingAccountIfsc = true
  profileCurrency = null
  renderPage(<AccountDetailPage />)
  expect(screen.getByText(messages.Common.notAvailable)).toBeVisible()
  expect(screen.getByText('₹2,500.50')).toBeVisible()
})

describe('business detail error state', () => {
  it('shows a history loading error without rendering stale cheque cards', () => {
    error = new Error('Could not load cheques')
    renderPage(<BusinessDetailPage />)
    expect(screen.getByText(messages.Common.loadDataError)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Clear cheque' }),
    ).not.toBeInTheDocument()
  })
})

describe('tag create and edit pages', () => {
  it.each([CreateTagPage, EditTagPage])(
    'shows placeholders before tag data is ready',
    (Component) => {
      loading = true
      const { container } = renderPage(<Component />)
      expect(container.querySelector('form')).toBeNull()
      expect(
        container.querySelector('[data-slot="skeleton"]'),
      ).toBeInTheDocument()
    },
  )
  it('requires an active business before creating tags', () => {
    active = false
    renderPage(<CreateTagPage />)
    expect(
      screen.queryByTestId('tag-form-submit-button'),
    ).not.toBeInTheDocument()
  })
  it('rejects blank tag names, trims valid input and navigates to the newly created tag', async () => {
    renderPage(<CreateTagPage />)
    const input = screen.getByRole('textbox', {
      name: new RegExp(messages.Tags.tagName),
    })
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.getByTestId('tag-form-submit-button')).toBeDisabled()
    fireEvent.change(input, { target: { value: '  Priority  ' } })
    fireEvent.click(screen.getByTestId('tag-form-submit-button'))
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/tags/created-tag'),
    )
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        business_id: 'business',
        name: 'Priority',
        color: expect.any(String),
      }),
    )
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.Tags.tagCreated,
      type: 'success',
    })
  })
  it.each([CreateTagPage, EditTagPage])(
    'reports save failures and keeps navigation unchanged',
    async (Component) => {
      mocks.create.mockRejectedValueOnce(new Error('Offline'))
      mocks.update.mockRejectedValueOnce(new Error('Offline'))
      renderPage(<Component />)
      fireEvent.change(
        screen.getByRole('textbox', {
          name: new RegExp(messages.Tags.tagName),
        }),
        {
          target: { value: 'Priority' },
        },
      )
      fireEvent.click(screen.getByTestId('tag-form-submit-button'))
      await waitFor(() =>
        expect(mocks.toast).toHaveBeenCalledWith({
          title: messages.Tags.saveFailed,
          type: 'error',
        }),
      )
      expect(mocks.replace).not.toHaveBeenCalled()
      expect(mocks.back).not.toHaveBeenCalled()
    },
  )
  it.each([CreateTagPage, EditTagPage])(
    'blocks submissions when already saving',
    (Component) => {
      saving = true
      renderPage(<Component />)
      fireEvent.change(
        screen.getByRole('textbox', {
          name: new RegExp(messages.Tags.tagName),
        }),
        {
          target: { value: 'Priority' },
        },
      )
      expect(screen.getByTestId('tag-form-submit-button')).toBeDisabled()
    },
  )
  it('shows a missing tag and does not render an update form', () => {
    found = false
    renderPage(<EditTagPage />)
    expect(screen.getByText(messages.Tags.notFound)).toBeVisible()
    expect(
      screen.queryByRole('textbox', {
        name: new RegExp(messages.Tags.tagName),
      }),
    ).not.toBeInTheDocument()
  })
  it('shows the delete-dialog placeholder while the dynamic dialog loads', () => {
    deferTagDeleteDialog = true
    const { container } = renderPage(<EditTagPage />)
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument()
  })
  it('keeps the docked save disabled until the tag changes and asks before leaving', () => {
    renderPage(<EditTagPage />)
    const input = screen.getByRole('textbox', {
      name: new RegExp(messages.Tags.tagName),
    })
    const save = screen.getByTestId('tag-form-submit-button')
    expect(screen.getByTestId('edit-save-bar')).toContainElement(save)
    expect(save).toHaveAttribute('form', 'tag-edit-form')
    expect(save).toBeDisabled()
    fireEvent.change(input, { target: { value: ' Urgent ' } })
    expect(save).toBeDisabled()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(save).toBeDisabled()
    const link = document.createElement('a')
    link.href = '/tags'
    document.body.append(link)
    fireEvent.click(link)
    expect(screen.getByTestId('unsaved-changes-dialog')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.keepEditing }),
    )
    expect(
      screen.queryByTestId('unsaved-changes-dialog'),
    ).not.toBeInTheDocument()
    link.remove()
    fireEvent.change(input, { target: { value: 'Urgent' } })
    expect(save).toBeDisabled()
    fireEvent.change(input, { target: { value: 'Later' } })
    expect(save).toBeEnabled()
  })
  it('prefills the existing tag, saves its update, and returns only after success', async () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    renderPage(<EditTagPage />)
    expect(
      screen.getByRole('textbox', { name: new RegExp(messages.Tags.tagName) }),
    ).toHaveValue('Urgent')
    fireEvent.change(
      screen.getByRole('textbox', { name: new RegExp(messages.Tags.tagName) }),
      {
        target: { value: ' Revised ' },
      },
    )
    fireEvent.submit(document.getElementById('tag-edit-form')!)
    await waitFor(() => expect(go).toHaveBeenCalledWith(-2))
    go.mockRestore()
    expect(mocks.update).toHaveBeenCalledWith({
      id: 'tag',
      input: { name: 'Revised', color: '#007AFF' },
    })
    expect(mocks.toast).toHaveBeenCalledWith({
      title: messages.Tags.tagUpdated,
      type: 'success',
    })
  })
  it('deletes the existing tag and returns to the tag list', async () => {
    renderPage(<EditTagPage />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm deletion' }),
    )
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/tags'))
    expect(mocks.delete).toHaveBeenCalledWith('tag')
  })
})

describe('tag detail page', () => {
  it('renders loading and missing tag states without linked rows', () => {
    loading = true
    const { container } = renderPage(<TagDetailPage />)
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument()
    cleanup()
    loading = false
    found = false
    renderPage(<TagDetailPage />)
    expect(screen.getByText(messages.Tags.notFound)).toBeVisible()
  })
  it('shows only linked records and switches between cheque, party, account and business destinations', () => {
    links = [
      { entity_type: 'cheque', entity_id: 'cheque' },
      { entity_type: 'party', entity_id: 'party' },
      { entity_type: 'account', entity_id: 'account' },
      { entity_type: 'business', entity_id: 'business' },
    ]
    renderPage(<TagDetailPage />)
    expect(screen.getByText('Linked cheque 100123')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }))
    expect(screen.getByRole('link', { name: /Customer One/ })).toHaveAttribute(
      'href',
      '/parties/party',
    )
    expect(screen.queryByText('Unlinked party')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Accounts/ }))
    expect(
      screen.getByRole('link', { name: /Operating account/ }),
    ).toHaveAttribute('href', '/accounts/account')
    expect(screen.getByText('Example Bank 5678')).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /Businesses/ }))
    expect(screen.getByRole('link', { name: /Acme Trading/ })).toHaveAttribute(
      'href',
      '/businesses/business',
    )
  })
  it('handles unavailable linked collections and accounts without a bank relation', () => {
    missingTagCollections = true
    links = [
      { entity_type: 'cheque', entity_id: 'cheque' },
      { entity_type: 'party', entity_id: 'party' },
      { entity_type: 'account', entity_id: 'account' },
    ]
    renderPage(<TagDetailPage />)
    expect(screen.getByText(messages.Tags.noLinkedItems)).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /Parties/ }))
    expect(screen.getByText(messages.Tags.noLinkedItems)).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: /Accounts/ }))
    expect(screen.getByText(messages.Tags.noLinkedItems)).toBeVisible()

    cleanup()
    missingTagCollections = false
    missingAccountBank = true
    links = [{ entity_type: 'account', entity_id: 'account' }]
    renderPage(<TagDetailPage />)
    fireEvent.click(screen.getByRole('tab', { name: /Accounts/ }))
    expect(screen.getByText('5678')).toBeVisible()
  })
  it('shows linked-list placeholders until the selected entity collection resolves', () => {
    listLoading = true
    const { container } = renderPage(<TagDetailPage />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    expect(
      screen.queryByText(messages.Tags.noLinkedItems),
    ).not.toBeInTheDocument()
  })
  it('explains unused tags and deletes only after confirmation', async () => {
    renderPage(<TagDetailPage />)
    expect(screen.getByText(messages.Tags.noLinkedItems)).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Confirm deletion' }),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.Tags.deleteTag }),
    )
    expect(mocks.delete).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm deletion' }),
    )
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/tags'))
    expect(mocks.delete).toHaveBeenCalledWith('tag')
  })
})
