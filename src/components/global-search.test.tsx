import type { ComponentProps, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalSearch } from './global-search'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  cheques: [
    { id: 'c1', cheque_number: '000001', amount: 100, party: { name: 'Asha' } },
  ],
  parties: [{ id: 'p1', name: 'Asha', contact: '+919876543210' }],
  accounts: [
    {
      id: 'a1',
      account_name: 'Asha Main',
      account_number: '12345',
      bank: { name: 'Asha Bank' },
    },
  ],
  drafts: {
    cheque: [
      {
        id: 'cd1',
        cheque_number: '000002',
        amount: 200,
        party: { name: 'Asha' },
      },
    ],
    party: [{ id: 'pd1', name: 'Asha Draft', contact: '+919876543210' }],
    account: [
      {
        id: 'ad1',
        account_name: 'Asha Draft',
        account_number: '98765',
        bank: { name: 'Asha Bank' },
      },
    ],
  },
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: { query: string }) =>
    values ? `${key} ${values.query}` : key,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'b1' } }),
}))
vi.mock('@/features/cheques/hooks/use-cheque-list', () => ({
  useChequeSearch: vi.fn(() => ({ cheques: state.cheques })),
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
beforeEach(() => vi.clearAllMocks())

describe('GlobalSearch', () => {
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
