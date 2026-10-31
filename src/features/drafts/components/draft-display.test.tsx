import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { DraftList } from './draft-list'
import { DraftsLink, DraftsSummaryCard } from './drafts-links'
import type { DraftCardProps } from './draft-card'

const state = vi.hoisted(() => ({
  drafts: {} as Record<string, object[] | undefined>,
  loading: false,
  mutateAsync: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: { id: 'b1' } }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { currency: '$' } }),
}))
vi.mock('../hooks/use-drafts', () => ({
  useDrafts: (entity: string) => ({
    data: state.drafts[entity],
    isLoading: state.loading,
  }),
  useDeleteDraft: () => ({ mutateAsync: state.mutateAsync }),
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
beforeEach(() => {
  state.drafts = {}
  state.loading = false
  vi.clearAllMocks()
  state.mutateAsync.mockResolvedValue(undefined)
})
afterEach(cleanup)
function mount(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  )
}

describe('DraftList', () => {
  it('shows loading placeholders followed by the empty state', () => {
    state.loading = true
    const { container, rerender } = mount(<DraftList entity="party" />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    state.loading = false
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DraftList entity="party" />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(messages.Drafts.emptyTitle)).toBeInTheDocument()
  })

  it('describes cheque amounts, parties, directions and resume links', () => {
    state.drafts.cheque = [
      {
        id: 'c1',
        amount: 100,
        party: { name: 'Asha' },
        type: 'Inward',
        cheque_number: '000001',
      },
      {
        id: 'c2',
        amount: null,
        party: { name: 'Bela' },
        type: 'Outward',
        cheque_number: null,
      },
      { id: 'c3', amount: null, party: null, type: null },
    ]
    mount(<DraftList entity="cheque" />)
    expect(screen.getByRole('link', { name: '$100' })).toHaveAttribute(
      'href',
      '/cheques/create?draftId=c1',
    )
    expect(screen.getByText('Asha')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bela' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: messages.Drafts.untitled }),
    ).toBeInTheDocument()
    expect(screen.getByText(/#000001/)).toHaveTextContent(
      messages.Cheques.received,
    )
  })

  it('shows party contact and deletes by ID before notifying success', async () => {
    state.drafts.party = [{ id: 'p1', name: 'Asha', contact: '+919876543210' }]
    mount(<DraftList entity="party" />)
    expect(screen.getByRole('link', { name: 'Asha' })).toHaveAttribute(
      'href',
      '/parties/create?draftId=p1',
    )
    expect(screen.getByText('+919876543210')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove draft' }))
    await waitFor(() =>
      expect(state.toast).toHaveBeenCalledWith({
        title: messages.Drafts.deleted,
        type: 'success',
      }),
    )
    expect(state.mutateAsync).toHaveBeenCalledExactlyOnceWith('p1')
  })

  it('masks account numbers and uses bank and untitled fallbacks', () => {
    state.drafts.account = [
      {
        id: 'a1',
        account_name: 'Main',
        account_number: '123456789',
        bank: { name: 'Example Bank' },
      },
      { id: 'a2', account_name: null, account_number: '00001111', bank: null },
      {
        id: 'a3',
        account_name: 'Other',
        account_number: null,
        bank: { name: 'Other Bank' },
      },
    ]
    mount(<DraftList entity="account" />)
    expect(screen.getByRole('link', { name: 'Main' })).toHaveAttribute(
      'href',
      '/accounts/create?draftId=a1',
    )
    expect(screen.getByText('Example Bank (6789)')).toBeInTheDocument()
    expect(
      screen.getByText(`${messages.Common.bank} (1111)`),
    ).toBeInTheDocument()
    expect(screen.getByText('Other Bank')).toBeInTheDocument()
    expect(screen.queryByText(/123456789/)).not.toBeInTheDocument()
  })
})

describe('draft summary links', () => {
  it('hides links and summary without saved drafts', () => {
    const { container } = mount(
      <>
        <DraftsLink entity="cheque" />
        <DraftsSummaryCard />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it.each(['cheque', 'party', 'account'] as const)(
    'links %s drafts to the feature list',
    (entity) => {
      state.drafts[entity] = [{ id: 'one' }]
      const paths = { cheque: 'cheques', party: 'parties', account: 'accounts' }
      mount(<DraftsLink entity={entity} />)
      expect(screen.getByRole('link')).toHaveAttribute(
        'href',
        `/${paths[entity]}/drafts`,
      )
    },
  )

  it('totals feature drafts and opens the first nonempty list', () => {
    state.drafts.party = [{ id: 'p1' }, { id: 'p2' }]
    state.drafts.account = [{ id: 'a1' }]
    mount(<DraftsSummaryCard />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/parties/drafts')
    expect(screen.getByRole('link')).toHaveTextContent('3')
    expect(screen.getByRole('link')).toHaveTextContent(
      `2 ${messages.Drafts.parties}`,
    )
    expect(screen.getByRole('link')).toHaveTextContent(
      `1 ${messages.Drafts.accounts}`,
    )
  })
})
