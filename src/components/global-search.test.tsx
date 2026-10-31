import type { ComponentProps, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalSearch } from './global-search'

type SearchCheque = {
  id: string
  cheque_number: string
  amount: number
  party?: { name: string }
}
type SearchParty = { id: string; name: string; contact: string | null }
type SearchAccount = {
  id: string
  account_name: string
  account_number: string
  bank: { name: string } | null
}
type SearchChequeDraft = {
  id: string
  cheque_number: string | null
  amount: number | null
  party?: { name: string }
}
type SearchPartyDraft = {
  id: string
  name: string | null
  contact: string | null
}
type SearchAccountDraft = {
  id: string
  account_name: string | null
  account_number: string | null
  bank: { name: string } | null
}

const state = vi.hoisted(() => ({
  active: true,
  loading: false,
  error: null as Error | null,
  push: vi.fn(),
  cheques: [
    { id: 'c1', cheque_number: '000001', amount: 100, party: { name: 'Asha' } },
  ] as SearchCheque[] | undefined,
  parties: [{ id: 'p1', name: 'Asha', contact: '+919876543210' }] as
    SearchParty[] | undefined,
  accounts: [
    {
      id: 'a1',
      account_name: 'Asha Main',
      account_number: '12345',
      bank: { name: 'Asha Bank' },
    },
  ] as SearchAccount[] | undefined,
  drafts: {
    cheque: [
      {
        id: 'cd1',
        cheque_number: '000002',
        amount: 200,
        party: { name: 'Asha' },
      },
    ] as SearchChequeDraft[] | undefined,
    party: [{ id: 'pd1', name: 'Asha Draft', contact: '+919876543210' }] as
      SearchPartyDraft[] | undefined,
    account: [
      {
        id: 'ad1',
        account_name: 'Asha Draft',
        account_number: '98765',
        bank: { name: 'Asha Bank' },
      },
    ] as SearchAccountDraft[] | undefined,
  },
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { query: string }) =>
    values ? `${key} ${values.query}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: state.active ? { id: 'b1' } : null }),
}))
vi.mock('@/features/cheques/hooks/use-cheque-list', () => ({
  useChequeSearch: vi.fn(() => ({
    cheques: state.cheques,
    isLoading: state.loading,
    error: state.error,
  })),
}))
vi.mock('@/features/parties/hooks/use-parties', () => ({
  useParties: vi.fn(() => ({ parties: state.parties })),
}))
vi.mock('@/features/accounts/hooks/use-accounts', () => ({
  useAccounts: vi.fn(() => ({ accounts: state.accounts })),
}))
vi.mock('@/features/drafts', () => ({
  DRAFT_CREATE_PATHS: {
    cheque: '/cheques/create',
    party: '/parties/create',
    account: '/accounts/create',
  },
  useDrafts: vi.fn((entity: keyof typeof state.drafts) => ({
    data: state.drafts[entity],
  })),
}))
vi.mock('@/components/ui/command', () => ({
  CommandDialog: ({
    open,
    children,
  }: {
    open: boolean
    children: ReactNode
  }) => (open ? <div>{children}</div> : null),
  CommandInput: ({
    onValueChange,
    ...props
  }: ComponentProps<'input'> & { onValueChange: (value: string) => void }) => (
    <input {...props} onChange={(event) => onValueChange(event.target.value)} />
  ),
  CommandEmpty: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  CommandGroup: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
    ...props
  }: {
    children: ReactNode
    onSelect: () => void
    value: string
  }) => (
    <button {...props} onClick={onSelect}>
      {children}
    </button>
  ),
}))
afterEach(cleanup)
const initial = {
  cheques: state.cheques,
  parties: state.parties,
  accounts: state.accounts,
  drafts: { ...state.drafts },
}
beforeEach(() => {
  vi.clearAllMocks()
  state.active = true
  state.loading = false
  state.error = null
  state.cheques = initial.cheques
  state.parties = initial.parties
  state.accounts = initial.accounts
  state.drafts = { ...initial.drafts }
})

describe('GlobalSearch', () => {
  it('hides loading text, preserves errors, and waits before showing no results', () => {
    state.loading = true
    state.active = false
    state.cheques = undefined
    state.parties = undefined
    state.accounts = undefined
    state.drafts = { cheque: undefined, party: undefined, account: undefined }
    const { rerender } = render(<GlobalSearch open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'missing' },
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('loading')).not.toBeInTheDocument()
    expect(screen.queryByText('noResultsFor missing')).not.toBeInTheDocument()
    state.loading = false
    state.error = new Error('offline')
    rerender(<GlobalSearch open onOpenChange={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('loadDataError')
    expect(screen.queryByText('noResultsFor missing')).not.toBeInTheDocument()
    state.error = null
    rerender(<GlobalSearch open onOpenChange={vi.fn()} />)
    expect(screen.getByText('noResultsFor missing')).toBeInTheDocument()
  })

  it.each(['', 'Asha'])(
    'keeps search usable without loading text for query "%s"',
    (query) => {
      state.loading = true
      render(<GlobalSearch open onOpenChange={vi.fn()} />)
      const input = screen.getByTestId('global-search-input')
      expect(input).toBeEnabled()
      fireEvent.change(input, { target: { value: query } })

      expect(screen.queryByText('loading')).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.queryByText(/^noResultsFor/)).not.toBeInTheDocument()
      expect(screen.queryAllByTestId(/^global-search-result-/)).toHaveLength(
        query ? 6 : 0,
      )
      if (query) {
        fireEvent.click(screen.getByTestId('global-search-result-party'))
        expect(state.push).toHaveBeenCalledExactlyOnceWith('/parties/p1')
      }
    },
  )

  it('searches incomplete drafts and records with missing optional relationships', () => {
    state.cheques = [{ id: 'c1', cheque_number: '000001', amount: 123 }]
    state.parties = [{ id: 'p1', name: 'Asha', contact: null }]
    state.accounts = [
      { id: 'a1', account_name: 'Asha', account_number: '123', bank: null },
    ]
    state.drafts = {
      cheque: [
        {
          id: 'cd1',
          cheque_number: null,
          amount: null,
          party: { name: 'Asha' },
        },
        { id: 'cd2', cheque_number: '123', amount: null },
      ],
      party: [
        { id: 'pd1', name: null, contact: '123' },
        { id: 'pd2', name: 'Asha', contact: null },
      ],
      account: [
        { id: 'ad1', account_name: null, account_number: '123', bank: null },
        {
          id: 'ad2',
          account_name: null,
          account_number: null,
          bank: { name: 'Asha Bank' },
        },
      ],
    }
    render(<GlobalSearch open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'Asha' },
    })
    expect(
      screen.getByTestId('global-search-result-cheque-draft'),
    ).toHaveTextContent('untitled')
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: '123' },
    })
    expect(
      screen.getByTestId('global-search-result-cheque'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('global-search-result-account'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('global-search-result-party-draft'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('global-search-result-account-draft'),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'missing' },
    })
    expect(screen.queryAllByTestId(/^global-search-result-/)).toHaveLength(0)
  })

  it('caps published results at five and draft results at three without conflating sections', () => {
    state.cheques = Array.from({ length: 8 }, (_, n) => ({
      id: `c${n}`,
      cheque_number: '123456',
      amount: 10,
    }))
    state.drafts.cheque = Array.from({ length: 8 }, (_, n) => ({
      id: `d${n}`,
      cheque_number: '123456',
      amount: 10,
    }))
    render(<GlobalSearch open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: '123456' },
    })
    expect(screen.getAllByTestId('global-search-result-cheque')).toHaveLength(5)
    expect(
      screen.getAllByTestId('global-search-result-cheque-draft'),
    ).toHaveLength(3)
  })
  it('shows no results until a query is entered and explains misses', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} />)
    expect(screen.queryAllByTestId(/^global-search-result-/)).toHaveLength(0)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'unmatched' },
    })
    expect(screen.getByText('noResultsFor unmatched')).toBeInTheDocument()
  })

  it('searches names case-insensitively across published records and drafts', () => {
    render(<GlobalSearch open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'ASHA' },
    })
    expect(screen.getAllByTestId(/^global-search-result-/)).toHaveLength(6)
  })

  it.each([
    ['cheque', '/cheques'],
    ['party', '/parties/p1'],
    ['account', '/accounts/a1'],
    ['cheque-draft', '/cheques/create?draftId=cd1'],
    ['party-draft', '/parties/create?draftId=pd1'],
    ['account-draft', '/accounts/create?draftId=ad1'],
  ])('navigates the %s result and closes search', (kind, path) => {
    const onOpenChange = vi.fn()
    render(<GlobalSearch open onOpenChange={onOpenChange} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: 'Asha' },
    })
    fireEvent.click(screen.getByTestId(`global-search-result-${kind}`))
    expect(state.push).toHaveBeenCalledExactlyOnceWith(path)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each([
    ['000001', 'cheque'],
    ['200', 'cheque-draft'],
    ['9876543210', 'party'],
    ['12345', 'account'],
    ['98765', 'account-draft'],
  ])('searches identifiers, amounts, or contacts: %s', (query, kind) => {
    render(<GlobalSearch open onOpenChange={vi.fn()} />)
    fireEvent.change(screen.getByTestId('global-search-input'), {
      target: { value: query },
    })
    expect(
      screen.getByTestId(`global-search-result-${kind}`),
    ).toBeInTheDocument()
  })

  it('does not render the dialog while closed', () => {
    const { container } = render(
      <GlobalSearch open={false} onOpenChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
