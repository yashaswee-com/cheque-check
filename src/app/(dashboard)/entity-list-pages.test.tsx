import { useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import AccountsPage from './accounts/page'
import PartiesPage from './parties/page'
import TagsPage from './tags/page'
import { TAG_COLORS } from '@/features/tags/lib/tag-colors'
import { expectHorizontalPillRows } from '@/test/pill-rows'

let loading = false
let empty = false
let noResults = false
let missingAccountDetails = false
let isDefault = false
let profile: { currency: string } | null = null
let error: Error | null = null
let bulk = false
function many<T extends { id: string }>(item: T) {
  return bulk
    ? Array.from({ length: 45 }, (_, index) => ({
        ...item,
        id: `${item.id}-${index}`,
      }))
    : [item]
}
const account = {
  id: 'account',
  account_name: 'Operating',
  account_number: '12345678',
  ifsc_code: 'TEST0000001',
  bank: { id: 'bank', name: 'Example Bank' },
}
const party = {
  id: 'party',
  name: 'Acme Traders',
  contact: '+919876543210',
  party_type: 'supplier',
}
const tag = { id: 'tag', name: 'Urgent', color: '#007AFF', usage_count: 3 }
function useList() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [bankFilter, setBankFilter] = useState('All')
  const [color, setColor] = useState<string | null>(null)
  const [usage, setUsage] = useState('all')
  const [partyType, setPartyType] = useState('all')
  const listedAccount = missingAccountDetails
    ? { ...account, bank: undefined, ifsc_code: null }
    : account
  const accountWithDefault = { ...listedAccount, is_default: isDefault }
  return {
    accounts: empty ? [] : many(accountWithDefault),
    filteredAccounts: empty || noResults ? [] : many(accountWithDefault),
    parties: empty ? [] : many(party),
    filteredParties: empty || noResults ? [] : many(party),
    tags: empty ? [] : many(tag),
    filteredTags: empty || noResults ? [] : many(tag),
    uniqueBanks: [account.bank],
    isLoading: loading,
    error,
    search,
    setSearch,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    bankFilter,
    setBankFilter,
    color,
    setColor,
    usage,
    setUsage,
    partyType,
    setPartyType,
    getBalance: () => 1500,
    clearFilters: () => {
      setSearch('')
      setColor(null)
      setUsage('all')
    },
  }
}
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'business' } }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile }),
}))
vi.mock('@/features/accounts/hooks/use-accounts', () => ({
  useAccounts: () => useList(),
}))
vi.mock('@/features/parties/hooks/use-parties', () => ({
  useParties: () => useList(),
}))
vi.mock('@/features/tags/hooks/use-tag-list', () => ({
  useTagList: () => useList(),
}))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagMap: () => ({}),
}))
vi.mock('@/features/tags/components/tag-chips', () => ({
  TagChips: () => <span>Attached tags</span>,
}))
vi.mock('@/features/premium-workspace/components/native-tools', () => ({
  NativeTools: () => null,
}))
vi.mock('@/features/drafts', () => ({
  DraftsLink: ({ entity }: { entity: string }) => (
    <a href={`/${entity === 'party' ? 'parties' : 'accounts'}/drafts`}>
      Drafts
    </a>
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
    <NextIntlClientProvider locale="en" messages={messages}>
      {page}
    </NextIntlClientProvider>,
  )
}
beforeEach(() => {
  isDefault = false
  loading = empty = noResults = false
  missingAccountDetails = false
  bulk = false
  profile = { currency: '$' }
  error = null
})
afterEach(cleanup)

it('shows a default badge only on the selected default account card', () => {
  isDefault = true
  const { rerender } = renderPage(<AccountsPage />)
  expect(screen.getByText(messages.Accounts.defaultAccount)).toBeVisible()
  isDefault = false
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountsPage />
    </NextIntlClientProvider>,
  )
  expect(
    screen.queryByText(messages.Accounts.defaultAccount),
  ).not.toBeInTheDocument()
})

describe.each([
  {
    kind: 'accounts',
    Component: AccountsPage,
    title: 'Operating',
    search: messages.Accounts.searchPlaceholder,
    sort: messages.Accounts.sortByBankName,
    sections: [
      messages.Common.sortBy,
      messages.Common.order,
      messages.Accounts.filterBank,
    ],
  },
  {
    kind: 'parties',
    Component: PartiesPage,
    title: 'Acme Traders',
    search: messages.Parties.searchPlaceholder,
    sort: messages.Parties.sortByBalance,
    sections: [
      messages.Common.sortBy,
      messages.Common.order,
      messages.Parties.partyType,
    ],
  },
  {
    kind: 'tags',
    Component: TagsPage,
    title: 'Urgent',
    search: messages.Tags.searchPlaceholder,
    sort: messages.Tags.sortByUsage,
    sections: [
      messages.Common.sortBy,
      messages.Common.order,
      messages.Tags.filterUsage,
      messages.Tags.filterColor,
    ],
  },
])('$kind list page', ({ kind, Component, title, search, sort, sections }) => {
  it('lays out every sort and filter section as a horizontally scrollable pill row', () => {
    renderPage(<Component />)
    expectHorizontalPillRows(sections)
  })
  it('pages long lists 20 at a time and returns to page one on a new search', () => {
    bulk = true
    renderPage(<Component />)
    const status = () => screen.getByTestId(`${kind}-pagination-status`)
    expect(status()).toHaveTextContent('1 / 3')
    expect(screen.getAllByText(title)).toHaveLength(20)
    const next = screen.getByRole('button', {
      name: messages.SharedUI.nextPage,
    })
    fireEvent.click(next)
    fireEvent.click(next)
    expect(status()).toHaveTextContent('3 / 3')
    expect(screen.getAllByText(title)).toHaveLength(5)
    expect(next).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(search), {
      target: { value: 'a' },
    })
    expect(status()).toHaveTextContent('1 / 3')
  })
  it('hides pagination when everything fits on one page', () => {
    renderPage(<Component />)
    expect(screen.queryByTestId(`${kind}-pagination`)).toBeNull()
  })
  it('renders records with usable detail links and entity-specific metadata', () => {
    renderPage(<Component />)
    expect(screen.getByText(title)).toBeVisible()
    expect(
      document.querySelector(
        `a[href="/${kind}/${kind === 'accounts' ? 'account' : kind === 'parties' ? 'party' : 'tag'}"]`,
      ),
    ).toBeInTheDocument()
    if (kind === 'accounts') {
      expect(screen.getByText('••••5678')).toBeVisible()
      expect(screen.getByText('TEST0000001')).toBeVisible()
      expect(screen.queryByText('12345678')).not.toBeInTheDocument()
    } else if (kind === 'parties') {
      expect(screen.getByText('$1,500')).toBeVisible()
      expect(
        screen.getByText(
          `${messages.Parties.partyTypeSupplier} · ${party.contact}`,
        ),
      ).toBeVisible()
    } else expect(screen.getByText('Used 3 times')).toBeVisible()
  })
  it('connects sort, order and search controls and clears a failed search', () => {
    noResults = true
    renderPage(<Component />)
    const input = screen.getByPlaceholderText(search)
    fireEvent.change(input, { target: { value: 'Missing' } })
    fireEvent.click(screen.getByRole('button', { name: sort }))
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.descending }),
    )
    expect(input).toHaveValue('Missing')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.clearAllFilters }),
    )
    expect(input).toHaveValue('')
  })
  it.each(['loading', 'empty', 'error'])(
    'shows %s instead of record links',
    (state) => {
      loading = state === 'loading'
      empty = state === 'empty'
      error = state === 'error' ? new Error('Offline') : null
      const { container } = renderPage(<Component />)
      expect(screen.queryByText(title)).not.toBeInTheDocument()
      if (state === 'loading')
        expect(
          container.querySelector('[data-slot="skeleton"]'),
        ).toBeInTheDocument()
      if (state === 'empty')
        expect(
          document.querySelector(`a[href="/${kind}/create"]`),
        ).toBeInTheDocument()
      if (state === 'error')
        expect(screen.getByText(messages.Common.loadDataError)).toBeVisible()
    },
  )
})
describe('list-specific filters', () => {
  it('uses the default currency when the party list has no profile', () => {
    profile = null
    renderPage(<PartiesPage />)

    expect(screen.getByText('₹1,500')).toBeVisible()
  })

  it('uses safe defaults when account bank and IFSC data are missing', () => {
    missingAccountDetails = true
    renderPage(<AccountsPage />)

    expect(screen.getByText(messages.Accounts.bank.charAt(0))).toBeVisible()
    expect(screen.getByText(messages.Common.noIfsc)).toBeVisible()
  })

  it('selects and resets an account bank filter', () => {
    renderPage(<AccountsPage />)
    const bank = screen.getByRole('button', { name: 'Example Bank' })
    fireEvent.click(bank)
    expect(bank).toHaveClass('border-primary')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.allBanks }),
    )
    expect(bank).not.toHaveClass('border-primary')
  })
  it('toggles tag colors and selects used/unused filters', () => {
    renderPage(<TagsPage />)
    const color = screen.getByRole('button', { name: TAG_COLORS[0].name })
    fireEvent.click(color)
    expect(color).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(color)
    expect(color).toHaveAttribute('aria-pressed', 'false')
    const used = screen.getByRole('button', { name: messages.Tags.used })
    fireEvent.click(used)
    expect(used).toHaveClass('border-primary')
    const unused = screen.getByRole('button', { name: messages.Tags.unused })
    fireEvent.click(unused)
    expect(unused).toHaveClass('border-primary')
    const allOptions = screen.getAllByRole('button', {
      name: messages.Common.all,
    })
    fireEvent.click(allOptions[1])
    expect(allOptions[1]).toHaveClass('border-primary')
  })
  it('selects a party type filter and resets it with clear filters', () => {
    noResults = true
    renderPage(<PartiesPage />)
    const all = screen.getByRole('button', {
      name: messages.Parties.partyTypeAll,
    })
    const vendor = screen.getByRole('button', {
      name: messages.Parties.partyTypeVendor,
    })
    expect(all).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(vendor)
    expect(vendor).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.clearAllFilters }),
    )
    expect(all).toHaveAttribute('aria-pressed', 'true')
  })
})
