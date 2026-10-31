import { useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import AccountsPage from './accounts/page'
import PartiesPage from './parties/page'
import TagsPage from './tags/page'

let loading = false
let empty = false
let noResults = false
let missingAccountDetails = false
let profile: { currency: string } | null = null
let error: Error | null = null
const account = {
  id: 'account',
  account_name: 'Operating',
  account_number: '12345678',
  ifsc_code: 'TEST0000001',
  bank: { id: 'bank', name: 'Example Bank' },
}
const party = { id: 'party', name: 'Customer', contact: '+919876543210' }
const tag = { id: 'tag', name: 'Urgent', color: '#007AFF', usage_count: 3 }
function useList() {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [bankFilter, setBankFilter] = useState('All')
  const [color, setColor] = useState<string | null>(null)
  const [usage, setUsage] = useState('all')
  const listedAccount = missingAccountDetails
    ? { ...account, bank: undefined, ifsc_code: null }
    : account
  return {
    accounts: empty ? [] : [listedAccount],
    filteredAccounts: empty || noResults ? [] : [listedAccount],
    parties: empty ? [] : [party],
    filteredParties: empty || noResults ? [] : [party],
    tags: empty ? [] : [tag],
    filteredTags: empty || noResults ? [] : [tag],
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
  loading = empty = noResults = false
  missingAccountDetails = false
  profile = { currency: '$' }
  error = null
})
afterEach(cleanup)

describe.each([
  {
    kind: 'accounts',
    Component: AccountsPage,
    title: 'Operating',
    search: messages.Accounts.searchPlaceholder,
    sort: messages.Accounts.sortByBankName,
  },
  {
    kind: 'parties',
    Component: PartiesPage,
    title: 'Customer',
    search: messages.Parties.searchPlaceholder,
    sort: messages.Parties.sortByBalance,
  },
  {
    kind: 'tags',
    Component: TagsPage,
    title: 'Urgent',
    search: messages.Tags.searchPlaceholder,
    sort: messages.Tags.sortByUsage,
  },
])('$kind list page', ({ kind, Component, title, search, sort }) => {
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
      expect(screen.getByText(party.contact)).toBeVisible()
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
    const color = screen
      .getAllByRole('button')
      .find((button) => button.hasAttribute('aria-pressed'))!
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
})
