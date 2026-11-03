import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { DraftsBrowser } from './drafts-browser'
import { DraftsLink, DraftsSummaryCard } from './drafts-links'
import type { DraftCardProps } from './draft-card'

type Item = { entity: string; draft: Record<string, unknown> }
const state = vi.hoisted(() => ({
  query: '',
  page: {
    data: undefined as
      | { items: Item[]; total: number; page: number; page_size: number }
      | undefined,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  counts: undefined as
    { cheque: number; party: number; account: number } | undefined,
  pageRequest: vi.fn(),
  replace: vi.fn(),
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: state.replace }),
  useSearchParams: () => new URLSearchParams(state.query),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'b1' } }),
}))
vi.mock('../hooks/use-drafts', () => ({
  useDraftsPage: (businessId: string, request: unknown) => {
    state.pageRequest(businessId, request)
    return state.page
  },
  useDraftCounts: () => ({ data: state.counts }),
  useDeleteDraft: (entity: string) => ({
    mutateAsync: (id: string) => state.mutateAsync(entity, id),
  }),
}))
vi.mock('@/components/ui/toast', () => ({ toast: { add: state.toast } }))
vi.mock('./draft-card', () => ({
  DraftCard: ({ title, subtitle, meta, href, onDelete }: DraftCardProps) => (
    <article>
      <a href={href}>{title}</a>
      <p>{subtitle}</p>
      <p>{meta}</p>
      <button onClick={() => void onDelete()}>Remove draft</button>
    </article>
  ),
}))

const at = (updated: string) => ({ updated_at: updated, business_id: 'b1' })
const page = (items: Item[], total = items.length, index = 0) => ({
  items,
  total,
  page: index,
  page_size: 50,
})

beforeEach(() => {
  vi.clearAllMocks()
  state.query = ''
  state.page.data = page([])
  state.page.isLoading = false
  state.page.isFetching = false
  state.page.isPlaceholderData = false
  state.page.error = null
  state.counts = undefined
  state.mutateAsync.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
function mount(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  )
}
const pill = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) })

describe('DraftsBrowser', () => {
  it('shows a loading skeleton', () => {
    state.page.data = undefined
    state.page.isLoading = true
    mount(<DraftsBrowser />)
    expect(screen.getByTestId('drafts-loading')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByTestId('drafts-pagination')).not.toBeInTheDocument()
  })

  it('shows the empty state when the business has no drafts', () => {
    mount(<DraftsBrowser />)
    expect(screen.getByTestId('drafts-empty')).toHaveTextContent(
      messages.Drafts.emptyTitle,
    )
  })

  it('describes mixed drafts with type labels and resume links', () => {
    state.page.data = page([
      {
        entity: 'cheque',
        draft: {
          id: 'c1',
          ...at('2026-01-03'),
          amount: 100,
          party: { name: 'Asha' },
          type: 'Inward',
          cheque_number: '000001',
        },
      },
      {
        entity: 'party',
        draft: { id: 'p1', ...at('2026-01-02'), name: null, contact: '+91' },
      },
      {
        entity: 'account',
        draft: {
          id: 'a1',
          ...at('2026-01-01'),
          account_name: 'Main',
          account_number: '123456789',
          bank: { name: 'Example Bank' },
        },
      },
    ])
    mount(<DraftsBrowser />)
    expect(screen.getByRole('link', { name: '₹100' })).toHaveAttribute(
      'href',
      '/cheques/create?draftId=c1',
    )
    expect(screen.getByText(/#000001/)).toHaveTextContent(
      `${messages.Drafts.cheque} · ${messages.Cheques.received}`,
    )
    expect(
      screen.getByRole('link', { name: messages.Drafts.untitled }),
    ).toHaveAttribute('href', '/parties/create?draftId=p1')
    expect(screen.getByText(messages.Drafts.party)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Main' })).toHaveAttribute(
      'href',
      '/accounts/create?draftId=a1',
    )
    expect(screen.getByText('Example Bank (6789)')).toBeInTheDocument()
    expect(screen.queryByText(/123456789/)).not.toBeInTheDocument()
  })

  it('reads filters from the URL and highlights the selected type', () => {
    state.query = 'type=party&q=acme&sort=oldest&page=2'
    mount(<DraftsBrowser />)
    expect(state.pageRequest).toHaveBeenCalledWith('b1', {
      types: ['party'],
      search: 'acme',
      ascending: true,
      page: 1,
    })
    expect(pill(messages.Drafts.parties)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(pill(messages.Drafts.allTypes)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('searchbox')).toHaveValue('acme')
  })

  it('ignores malformed URL filters', () => {
    state.query = 'type=invoice&sort=weird&page=-4'
    mount(<DraftsBrowser />)
    expect(state.pageRequest).toHaveBeenCalledWith('b1', {
      types: [],
      search: '',
      ascending: false,
      page: 0,
    })
  })

  it('shows per-type counts and switches type while keeping the search', () => {
    state.query = 'q=acme&page=3'
    state.counts = { cheque: 2, party: 1, account: 0 }
    mount(<DraftsBrowser />)
    expect(pill(messages.Drafts.allTypes)).toHaveTextContent('3')
    expect(pill(messages.Drafts.cheques)).toHaveTextContent('2')
    fireEvent.click(pill(messages.Drafts.cheques))
    expect(state.replace).toHaveBeenCalledWith('/drafts?type=cheque&q=acme', {
      scroll: false,
    })
  })

  it('debounces typed searches into the URL and resets paging', () => {
    vi.useFakeTimers()
    state.query = 'type=account&page=2'
    mount(<DraftsBrowser />)
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'sbi' },
    })
    expect(state.replace).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(250))
    expect(state.replace).toHaveBeenCalledWith('/drafts?type=account&q=sbi', {
      scroll: false,
    })
  })

  it('sorts by oldest edits from the sort sheet', async () => {
    mount(<DraftsBrowser />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.sortAndFilter }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: messages.Drafts.sortOldest }),
    )
    expect(state.replace).toHaveBeenCalledWith('/drafts?sort=oldest', {
      scroll: false,
    })
  })

  it('offers to clear a search that matches nothing', () => {
    state.query = 'q=zzz'
    mount(<DraftsBrowser />)
    const empty = screen.getByTestId('drafts-no-match')
    fireEvent.click(
      screen.getByRole('button', { name: messages.Drafts.clearSearch }),
    )
    expect(empty).toBeInTheDocument()
    expect(state.replace).toHaveBeenCalledWith('/drafts', { scroll: false })
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })

  it('shows an error with retry', () => {
    state.page.data = undefined
    state.page.error = new Error('offline')
    mount(<DraftsBrowser />)
    expect(screen.getByTestId('drafts-error')).toHaveAttribute('role', 'alert')
    fireEvent.click(screen.getByRole('button', { name: messages.Drafts.retry }))
    expect(state.page.refetch).toHaveBeenCalled()
    expect(screen.queryByTestId('drafts-pagination')).not.toBeInTheDocument()
  })

  it('pages through results with sticky pagination', () => {
    state.query = 'type=cheque&page=2'
    state.page.data = page(
      [
        {
          entity: 'party',
          draft: { id: 'p1', ...at('2026-01-01'), name: 'A' },
        },
      ],
      120,
      1,
    )
    mount(<DraftsBrowser />)
    const pagination = screen.getByTestId('drafts-pagination')
    expect(pagination).toHaveTextContent('2 / 3')
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.nextPage }),
    )
    expect(state.replace).toHaveBeenLastCalledWith(
      '/drafts?type=cheque&page=3',
      { scroll: false },
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.previousPage }),
    )
    expect(state.replace).toHaveBeenLastCalledWith('/drafts?type=cheque', {
      scroll: false,
    })
  })

  it('moves to the last page when the current page no longer exists', async () => {
    state.query = 'page=4'
    state.page.data = page([], 60, 3)
    mount(<DraftsBrowser />)
    await waitFor(() =>
      expect(state.replace).toHaveBeenCalledWith('/drafts?page=2', {
        scroll: false,
      }),
    )
  })

  it('deletes a draft through its own entity and confirms', async () => {
    state.page.data = page([
      { entity: 'account', draft: { id: 'a1', ...at('2026-01-01') } },
    ])
    mount(<DraftsBrowser />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove draft' }))
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        title: messages.Drafts.deleted,
        type: 'success',
      }),
    )
    expect(state.mutateAsync).toHaveBeenCalledExactlyOnceWith('account', 'a1')
  })
})

describe('draft summary links', () => {
  it('hides links and summary without saved drafts', () => {
    state.counts = { cheque: 0, party: 0, account: 0 }
    const { container } = mount(
      <>
        <DraftsLink entity="cheque" />
        <DraftsSummaryCard />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it.each(['cheque', 'party', 'account'] as const)(
    'opens the drafts page filtered to %s drafts',
    (entity) => {
      state.counts = { cheque: 0, party: 0, account: 0, [entity]: 4 }
      mount(<DraftsLink entity={entity} />)
      expect(screen.getByRole('link')).toHaveAttribute(
        'href',
        `/drafts?type=${entity}`,
      )
      expect(screen.getByRole('link')).toHaveTextContent('4')
    },
  )

  it('totals every draft type and opens the unfiltered drafts page', () => {
    state.counts = { cheque: 0, party: 2, account: 1 }
    mount(<DraftsSummaryCard />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/drafts')
    expect(link).toHaveTextContent('3')
    expect(link).toHaveTextContent(`2 ${messages.Drafts.parties}`)
    expect(link).toHaveTextContent(`1 ${messages.Drafts.accounts}`)
    expect(link).not.toHaveTextContent(messages.Drafts.cheques)
  })
})
