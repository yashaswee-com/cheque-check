import type { ReactNode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { ScopedChequeList } from './scoped-cheque-list'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  nextPage: vi.fn(),
  previousPage: vi.fn(),
  replace: vi.fn(),
}))
let page = {
  cheques: [{ id: 'c1', cheque_number: '000111' }],
  pageIndex: 0,
  hasNextPage: true,
}
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('party_id=spoofed&type=Outward'),
  usePathname: () => '/parties/p1',
  useRouter: () => ({ replace: mocks.replace }),
}))
vi.mock('../hooks/use-cheque-list', () => ({
  useChequeList: (...args: unknown[]) => {
    mocks.list(...args)
    return {
      ...page,
      activeCount: 9,
      isLoading: false,
      error: null,
      search: '',
      setSearch: vi.fn(),
      filter: 'All',
      setFilter: vi.fn(),
      sortBy: 'date',
      setSortBy: vi.fn(),
      sortOrder: 'desc',
      setSortOrder: vi.fn(),
      updateStatus: vi.fn(),
      nextPage: mocks.nextPage,
      previousPage: mocks.previousPage,
    }
  },
}))
vi.mock('./cheque-list-filter-controls', () => ({
  ChequeListFilterControls: () => <div>Filter controls</div>,
}))
vi.mock('@/features/tags/hooks/use-entity-tags', () => ({
  useEntityTagMap: () => ({}),
}))
vi.mock('@/components/cheque-card', () => ({
  ChequeCard: ({ cheque }: { cheque: { cheque_number: string } }) => (
    <p>Cheque {cheque.cheque_number}</p>
  ),
}))

function renderList(totalCount = 3, empty: ReactNode = <p>Nothing yet</p>) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ScopedChequeList
        businessId="b1"
        scope={{ party_id: 'p1' }}
        totalCount={totalCount}
        emptyState={empty}
      />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  page = {
    cheques: [{ id: 'c1', cheque_number: '000111' }],
    pageIndex: 0,
    hasNextPage: true,
  }
})
afterEach(cleanup)

it('pins the entity scope over URL filters and pages through server results', () => {
  renderList()
  expect(mocks.list).toHaveBeenLastCalledWith(
    'b1',
    expect.objectContaining({ type: 'Outward', party_id: 'p1' }),
    expect.objectContaining({ sortBy: 'date', sortOrder: 'desc' }),
  )
  expect(screen.getByText('Cheque 000111')).toBeVisible()
  expect(
    screen.getByRole('button', { name: messages.SharedUI.previousPage }),
  ).toBeDisabled()
  fireEvent.click(
    screen.getByRole('button', { name: messages.SharedUI.nextPage }),
  )
  expect(mocks.nextPage).toHaveBeenCalledOnce()
})

it('hides pagination for a single page and separates empty from no-match states', () => {
  page = { cheques: [], pageIndex: 0, hasNextPage: false }
  renderList(0)
  expect(screen.getByText('Nothing yet')).toBeVisible()
  expect(
    screen.queryByRole('button', { name: messages.SharedUI.nextPage }),
  ).not.toBeInTheDocument()
  cleanup()
  renderList(3)
  expect(screen.getByText(messages.Cheques.noChequesMatch)).toBeVisible()
  expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
})
