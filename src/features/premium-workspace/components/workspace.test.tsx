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
import { TemplatesPanel } from './templates-panel'
import { FiltersPanel } from './filters-panel'
import { ReportsPanel } from './reports-panel'
import { MessagePanel } from './message-panel'
import { SavedTools } from './saved-tools'
import { PremiumWorkspace } from './workspace'
import type { ChequeRow, SavedTool, WorkspaceContext } from '../types'

const {
  importRows,
  bulkStatus,
  snapshot,
  applyTool,
  saveTool,
  deleteTool,
  downloadPdf,
} = vi.hoisted(() => ({
  importRows: vi.fn(),
  bulkStatus: vi.fn(),
  snapshot: vi.fn(),
  applyTool: vi.fn(),
  saveTool: vi.fn(),
  deleteTool: vi.fn(),
  downloadPdf: vi.fn(),
}))
const hookState = vi.hoisted(() => ({
  isLoading: false,
  activeBusiness: null as { id: string; name: string } | null,
  businesses: [] as { id: string; name: string }[],
  contextPending: false,
  contextError: false,
  toolsPending: false,
  toolsError: false,
  busy: false,
  notice: null as 'success' | 'error' | null,
  setActiveBusiness: vi.fn(),
  setNotice: vi.fn(),
  refetchContext: vi.fn(),
  refetchTools: vi.fn(),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: hookState.activeBusiness,
    businesses: hookState.businesses,
    setActiveBusiness: hookState.setActiveBusiness,
    isLoading: hookState.isLoading,
  }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: null }),
}))
vi.mock('../hooks/use-workspace', () => ({
  useWorkspaceContext: () => ({
    data: context,
    isPending: hookState.contextPending,
    isError: hookState.contextError,
    refetch: hookState.refetchContext,
  }),
  useWorkspaceTools: () => ({
    data: [] as SavedTool[],
    isPending: hookState.toolsPending,
    isError: hookState.toolsError,
    refetch: hookState.refetchTools,
  }),
}))
vi.mock('../hooks/use-workspace-action', () => ({
  useWorkspaceAction: () => ({
    busy: hookState.busy,
    notice: hookState.notice,
    setNotice: hookState.setNotice,
    run: async (action: () => Promise<unknown>) => action(),
  }),
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  usePremiumAction: () => ({ requireAccess: () => true }),
  PremiumGate: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/features/monetization/components/premium-mark', () => ({
  PremiumMark: () => null,
}))
vi.mock('../service', () => ({
  premiumWorkspaceService: {
    importRows,
    bulkStatus,
    snapshot,
    applyTool,
    saveTool,
    deleteTool,
  },
}))
vi.mock('../statement-pdf', () => ({ downloadStatementPdf: downloadPdf }))
const cheque: ChequeRow = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '123456',
  amount: 125,
  cheque_date: '2025-01-01',
  deposit_date: '2025-01-02',
  type: 'Outward',
  status: 'Issued',
  notes: 'Recurring',
  image_url: null,
  is_draft: false,
  remind_before_days: null,
  created_at: null,
  updated_at: null,
  deleted_at: null,
  deletion_batch_id: null,
}
const context: WorkspaceContext = {
  cheques: [cheque],
  parties: [
    {
      id: 'p1',
      business_id: 'b1',
      name: 'Asha',
      contact: '+919876543210',
      is_draft: false,
    } as WorkspaceContext['parties'][number],
  ],
  accounts: [
    {
      id: 'a1',
      business_id: 'b1',
      account_name: 'Main',
      account_number: '1111',
      is_draft: false,
    } as WorkspaceContext['accounts'][number],
  ],
}
const run = async (action: () => Promise<unknown>) => {
  await action()
}
const common = { businessId: 'b1', context, tools: [], run, busy: false }
const savedTool: SavedTool = {
  id: 'tool',
  user_id: 'u1',
  business_id: 'b1',
  kind: 'saved-view',
  name: 'My view',
  payload: {},
  created_at: '2026-10-31',
  updated_at: '2026-10-31',
  deleted_at: null,
  deletion_batch_id: null,
}
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  hookState.isLoading = false
  hookState.activeBusiness = null
  hookState.businesses = []
  hookState.contextPending = false
  hookState.contextError = false
  hookState.toolsPending = false
  hookState.toolsError = false
  hookState.busy = false
  hookState.notice = null
})
afterEach(cleanup)

describe('workspace workflows', () => {
  it('does not turn malformed optional dates into unbounded report requests', () => {
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="$"
        mode="statement"
        initialPartyId="p1"
      />,
    )
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeEnabled()
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '31/02/2028' },
    })
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.exportPdf }),
    ).toBeDisabled()
    expect(snapshot).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '' },
    })
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeEnabled()
  })

  it('blocks bulk actions and preserves applied filters until malformed dates are reset', () => {
    const changed = vi.fn()
    wrap(
      <FiltersPanel
        {...common}
        currency="$"
        mode="bulk"
        onFiltersChange={changed}
      />,
    )
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '2026-10-01' },
    })
    const calls = changed.mock.calls.length
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: 'invalid' },
    })
    expect(changed).toHaveBeenCalledTimes(calls)
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.selectAll }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.reset }),
    )
    expect(screen.getByLabelText(messages.PremiumWorkspace.from)).toHaveValue(
      '',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(changed).toHaveBeenLastCalledWith({})
  })

  it('blocks a pending template confirmation when an optional deposit date becomes malformed', () => {
    wrap(<TemplatesPanel {...common} tools={[]} />)
    for (const [label, value] of [
      ['Party', 'p1'],
      ['Account', 'a1'],
      ['Amount', '250'],
      ['Cheque number', '000003'],
      ['Cheque date', '2026-10-31'],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.createCheque,
      }),
    )
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.confirm }),
    ).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Deposit date'), {
      target: { value: 'invalid' },
    })
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.confirm }),
    ).toBeDisabled()
    expect(importRows).not.toHaveBeenCalled()
  })

  it('distinguishes workspace loading and missing-business states', () => {
    hookState.isLoading = true
    const { rerender } = wrap(<PremiumWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.PremiumWorkspace.loading,
    )
    hookState.isLoading = false
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumWorkspace />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByText(messages.PremiumWorkspace.noBusiness),
    ).toBeInTheDocument()
  })

  it('shows workspace loading and retries context and saved-tool failures', () => {
    const activeBusiness = { id: 'b1', name: 'Acme' }
    hookState.activeBusiness = activeBusiness
    hookState.businesses = [activeBusiness]
    hookState.contextPending = true
    const { rerender } = wrap(<PremiumWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent(
      messages.PremiumWorkspace.loading,
    )

    hookState.contextPending = false
    hookState.toolsError = true
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumWorkspace />
      </NextIntlClientProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.retry }),
    )
    expect(hookState.refetchContext).toHaveBeenCalledOnce()
    expect(hookState.refetchTools).toHaveBeenCalledOnce()
  })

  it('renders the active workspace and selects another business', () => {
    const activeBusiness = { id: 'b1', name: 'Acme' }
    hookState.activeBusiness = activeBusiness
    hookState.businesses = [activeBusiness, { id: 'b2', name: 'Second' }]
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumWorkspace />
      </NextIntlClientProvider>,
    )
    expect(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.tabs.import,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(
      screen.getByLabelText(messages.PremiumWorkspace.business),
      { target: { value: 'b2' } },
    )
    expect(hookState.setActiveBusiness).toHaveBeenCalledWith(
      hookState.businesses[1],
    )
  })

  it('saves, applies and confirms deletion of named tools', async () => {
    const apply = vi.fn()
    applyTool.mockResolvedValue({ search: '123' })
    const tool = savedTool
    wrap(
      <SavedTools
        businessId="b1"
        kind="saved-view"
        tools={[tool]}
        payload={{ status: 'Issued' }}
        onApply={apply}
        run={run}
        busy={false}
      />,
    )
    fireEvent.change(
      screen.getByLabelText(messages.PremiumWorkspace.toolName),
      { target: { value: 'New view' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.save }),
    )
    await waitFor(() =>
      expect(saveTool).toHaveBeenCalledWith('b1', 'saved-view', 'New view', {
        status: 'Issued',
      }),
    )
    await waitFor(() =>
      expect(
        screen.getByLabelText(messages.PremiumWorkspace.toolName),
      ).toHaveValue(''),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.apply }),
    )
    await waitFor(() => expect(apply).toHaveBeenCalledWith({ search: '123' }))
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.delete }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.cancel }),
    )
    expect(deleteTool).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.delete }),
    )
    fireEvent.click(
      screen
        .getAllByRole('button', { name: messages.PremiumWorkspace.delete })
        .at(-1)!,
    )
    await waitFor(() => expect(deleteTool).toHaveBeenCalledWith('tool'))
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
  })

  it('edits all filter fields and resets selection, including select-all and confirmation cancel', () => {
    const changed = vi.fn()
    wrap(
      <FiltersPanel
        {...common}
        currency="₹"
        mode="bulk"
        onFiltersChange={changed}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.selectAll }),
    )
    expect(screen.getByRole('checkbox')).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.selectAll }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.updateSelected,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.cancel }),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.clearSelection,
      }),
    )
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    for (const [label, value] of [
      [messages.PremiumWorkspace.fields.status, 'Issued'],
      [messages.PremiumWorkspace.fields.type, 'Outward'],
      [messages.PremiumWorkspace.fields.party_id, 'p1'],
      [messages.PremiumWorkspace.from, '2025-01-01'],
      [messages.PremiumWorkspace.to, '2025-01-02'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    expect(changed).toHaveBeenLastCalledWith({
      status: 'Issued',
      type: 'Outward',
      party_id: 'p1',
      from: '2025-01-01',
      to: '2025-01-02',
    })
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.reset }),
    )
    expect(changed).toHaveBeenLastCalledWith({})
  })

  it('clears optional filters and reports an invalid date interval', () => {
    const changed = vi.fn()
    wrap(
      <FiltersPanel
        {...common}
        currency="₹"
        mode="bulk"
        onFiltersChange={changed}
      />,
    )
    for (const [label, value] of [
      [messages.PremiumWorkspace.search, 'cheque'],
      [messages.PremiumWorkspace.fields.status, 'Issued'],
      [messages.PremiumWorkspace.fields.type, 'Outward'],
      [messages.PremiumWorkspace.fields.party_id, 'p1'],
      [messages.PremiumWorkspace.from, '2026-10-31'],
      [messages.PremiumWorkspace.to, '2026-10-01'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      messages.Common.invalidDateFormat.replace('{format}', 'DD/MM/YYYY'),
    )
    for (const label of [
      messages.PremiumWorkspace.search,
      messages.PremiumWorkspace.fields.status,
      messages.PremiumWorkspace.fields.type,
      messages.PremiumWorkspace.fields.party_id,
      messages.PremiumWorkspace.from,
      messages.PremiumWorkspace.to,
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '' } })
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(changed).toHaveBeenLastCalledWith({
      search: '',
      status: undefined,
      type: undefined,
      party_id: undefined,
      from: undefined,
      to: undefined,
    })
  })

  it('edits all template fields, shows validation errors and cancels a valid creation', async () => {
    applyTool.mockResolvedValue({
      party_id: 'p1',
      account_id: 'a1',
      amount: 125,
    })
    wrap(
      <TemplatesPanel
        {...common}
        tools={[
          {
            ...savedTool,
            id: 'template',
            name: 'Recurring',
            kind: 'cheque-template',
          },
        ]}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.apply }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Amount')).toHaveValue('125'),
    )
    for (const [label, value] of [
      ['Party', 'p1'],
      ['Account', 'a1'],
      ['Direction', 'Outward'],
      ['Amount', '250'],
      ['Cheque number', '000003'],
      ['Cheque date', '2026-10-31'],
      ['Deposit date', '2026-11-01'],
      ['Notes', 'Monthly invoice'],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    fireEvent.click(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.createCheque,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.cancel }),
    )
    expect(importRows).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '-10' },
    })
    expect(
      screen.getByRole('button', {
        name: messages.PremiumWorkspace.createCheque,
      }),
    ).toBeDisabled()
  })

  it('uses sample message data and applies saved message bodies', async () => {
    applyTool.mockResolvedValue({ body: 'Hello {party}' })
    wrap(
      <MessagePanel
        {...common}
        businessName="Acme"
        currency="₹"
        tools={[
          {
            ...savedTool,
            id: 'message',
            name: 'Reminder',
            payload: { body: '{party} {amount}' },
            kind: 'message-template',
          },
        ]}
      />,
    )
    fireEvent.change(
      screen.getByLabelText(messages.PremiumWorkspace.previewCheque),
      { target: { value: '' } },
    )
    expect(screen.getByText(/₹1,000/)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.apply }),
    )
    await waitFor(() =>
      expect(
        screen.getByLabelText(messages.PremiumWorkspace.messageBody),
      ).toHaveValue('Hello {party}'),
    )
  })

  it('uses the safe default message when no saved template is available', () => {
    wrap(
      <MessagePanel
        {...common}
        businessName="Acme"
        currency="₹"
        tools={[]}
        context={{ cheques: [], parties: [], accounts: [] }}
      />,
    )
    expect(
      (
        screen.getByLabelText(
          messages.PremiumWorkspace.messageBody,
        ) as HTMLTextAreaElement
      ).value,
    ).toContain('{party}')
    expect(
      screen.getByLabelText(messages.PremiumWorkspace.previewCheque),
    ).toHaveValue('')
  })

  it('invalidates report snapshots when date boundaries change', () => {
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
      />,
    )
    fireEvent.change(screen.getByLabelText('Party'), {
      target: { value: 'p1' },
    })
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '2026-10-31' },
    })
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.to), {
      target: { value: '2026-10-01' },
    })
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      messages.Common.invalidDateFormat.replace('{format}', 'DD/MM/YYYY'),
    )
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeDisabled()
  })

  it('generates and downloads a statement only after selecting its party', async () => {
    snapshot.mockResolvedValue({
      businesses: [{ id: 'b1', name: 'Acme' }],
      cheques: [cheque],
    })
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
      />,
    )
    fireEvent.change(screen.getByLabelText('Party'), {
      target: { value: 'p1' },
    })
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '2026-10-01' },
    })
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.to), {
      target: { value: '2026-10-31' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    )
    await waitFor(() =>
      expect(snapshot).toHaveBeenCalledWith(
        ['b1'],
        'p1',
        '2026-10-01',
        '2026-10-31',
      ),
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.exportPdf }),
    )
    await waitFor(() =>
      expect(downloadPdf).toHaveBeenCalledWith(
        expect.objectContaining({
          business: 'Acme',
          party: 'Asha',
          cheques: [cheque],
        }),
      ),
    )
    expect(
      screen.getAllByText(messages.PremiumWorkspace.summary.count),
    ).not.toHaveLength(0)
  })

  it('uses fixed-party statement mode without rendering an editable selector', () => {
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
        onlyPartyId="p1"
      />,
    )
    expect(screen.getByText('Asha')).toBeInTheDocument()
    expect(screen.queryByLabelText('Party')).not.toBeInTheDocument()
  })

  it('handles a stale fixed party and invalid report dates safely', () => {
    const { unmount } = wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        context={{ cheques: [], parties: [], accounts: [] }}
        currency="₹"
        mode="statement"
        onlyPartyId="deleted-party"
      />,
    )
    expect(
      screen.getByText(messages.PremiumWorkspace.choose),
    ).toBeInTheDocument()
    unmount()

    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
      />,
    )
    fireEvent.change(
      screen.getByLabelText(messages.PremiumWorkspace.fields.party_id),
      {
        target: { value: 'p1' },
      },
    )
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.from), {
      target: { value: '2026-10-31' },
    })
    fireEvent.change(screen.getByLabelText(messages.PremiumWorkspace.to), {
      target: { value: '2026-10-01' },
    })
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      messages.Common.invalidDateFormat.replace('{format}', 'DD/MM/YYYY'),
    )
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeDisabled()
  })

  it('requires at least one business in consolidated report scope', () => {
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[]}
        context={{ cheques: [], parties: [], accounts: [] }}
        currency="₹"
        mode="consolidated"
      />,
    )
    expect(
      screen.getByRole('button', { name: messages.PremiumWorkspace.generate }),
    ).toBeDisabled()
  })

  it('prefills a recurring cheque without copying its number or dates and requires confirmation to create', async () => {
    wrap(<TemplatesPanel {...common} />)
    fireEvent.change(screen.getByLabelText('Start with a previous cheque'), {
      target: { value: 'c1' },
    })
    expect(screen.getByLabelText('Cheque number')).toHaveValue('')
    expect(screen.getByLabelText('Cheque date')).not.toHaveValue('2025-01-01')
    expect(screen.getByLabelText('Party')).toHaveValue('p1')
    expect(screen.getByLabelText('Amount')).toHaveValue('125')
    fireEvent.change(screen.getByLabelText('Cheque number'), {
      target: { value: '000002' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create cheque' }))
    expect(importRows).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(importRows).toHaveBeenCalledWith('b1', 'cheques', [
        expect.objectContaining({
          cheque_number: '000002',
          party_id: 'p1',
          amount: '125',
        }),
      ]),
    )
  })

  it('applies a saved template and leaves a new cheque number blank', async () => {
    applyTool.mockResolvedValue({
      party_id: 'p1',
      account_id: 'a1',
      amount: 300,
      cheque_number: '999999',
    })
    wrap(
      <TemplatesPanel
        {...common}
        tools={[
          {
            ...savedTool,
            id: 'template',
            name: 'Saved cheque',
            kind: 'cheque-template',
          },
        ]}
      />,
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.PremiumWorkspace.apply }),
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Amount')).toHaveValue('300'),
    )
    expect(screen.getByLabelText('Cheque number')).toHaveValue('')
  })
  it('keeps individual cheque links and confirms selection before an atomic batch action', async () => {
    wrap(<FiltersPanel {...common} currency="₹" mode="bulk" />)
    expect(screen.getByRole('link', { name: '123456' })).toHaveAttribute(
      'href',
      '/cheques/c1',
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select cheque 123456' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Update selected' }))
    expect(bulkStatus).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Change all 1 selected cheques to Cleared?',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(bulkStatus).toHaveBeenCalledExactlyOnceWith(
        'b1',
        ['c1'],
        'Cleared',
      ),
    )
  })
  it('blocks an opposite-direction status and clears selection when filters change', () => {
    wrap(<FiltersPanel {...common} currency="₹" mode="bulk" />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select cheque 123456' }),
    )
    fireEvent.change(screen.getByLabelText('New status'), {
      target: { value: 'Received' },
    })
    expect(
      screen.getByRole('button', { name: 'Update selected' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Search cheque number or notes'), {
      target: { value: '123' },
    })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('applies a persisted view through the backend and filters the actual cheque list', async () => {
    applyTool.mockResolvedValue({ status: 'Cleared' })
    const onFiltersChange = vi.fn()
    const tools: SavedTool[] = [
      {
        id: 'v1',
        user_id: 'u1',
        business_id: 'b1',
        name: 'Cleared view',
        kind: 'saved-view',
        payload: { status: 'Cleared' },
        created_at: '2026-10-17',
        updated_at: '2026-10-17',
        deleted_at: null,
        deletion_batch_id: null,
      },
    ]
    wrap(
      <FiltersPanel
        {...common}
        tools={tools}
        currency="₹"
        mode="views"
        onFiltersChange={onFiltersChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(applyTool).toHaveBeenCalledWith('v1'))
    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenCalledWith({ status: 'Cleared' }),
    )
    expect(
      await screen.findByText('No cheques match this scope.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toHaveValue('Cleared')
  })
  it('re-fetches a fresh entitlement-checked statement for every PDF export', async () => {
    snapshot.mockResolvedValue({
      businesses: [{ id: 'b1', name: 'Acme' }],
      cheques: [cheque],
    })
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
      />,
    )
    fireEvent.change(screen.getByLabelText('Party'), {
      target: { value: 'p1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }))
    await waitFor(() => expect(downloadPdf).toHaveBeenCalledTimes(1))
    expect(snapshot).toHaveBeenCalledTimes(2)
    expect(downloadPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        business: 'Acme',
        party: 'Asha',
        cheques: [cheque],
      }),
    )
  })
  it('only submits the checked owned businesses for a consolidated dashboard', async () => {
    snapshot.mockResolvedValue({
      businesses: [{ id: 'b1', name: 'Acme' }],
      cheques: [cheque],
    })
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[
          { id: 'b1', name: 'Acme' },
          { id: 'b2', name: 'Other' },
        ]}
        currency="₹"
        mode="consolidated"
      />,
    )
    fireEvent.click(screen.getByLabelText('Other'))
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() =>
      expect(snapshot).toHaveBeenCalledWith(['b1'], undefined, '', ''),
    )
  })
  it('selects a deep-linked party only when that party belongs to the current owned business', () => {
    const { unmount } = wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
        initialPartyId="foreign-party"
      />,
    )
    expect(screen.getByLabelText('Party')).toHaveValue('')
    unmount()
    wrap(
      <ReportsPanel
        {...common}
        businessName="Acme"
        businesses={[{ id: 'b1', name: 'Acme' }]}
        currency="₹"
        mode="statement"
        initialPartyId="p1"
      />,
    )
    expect(screen.getByLabelText('Party')).toHaveValue('p1')
  })
  it('renders a localized template preview without sending messages and blocks unapproved placeholders', () => {
    wrap(<MessagePanel {...common} businessName="Acme" currency="₹" />)
    expect(screen.getByText(/Hi Asha,/)).toHaveTextContent('Regards, Acme')
    expect(screen.getByLabelText('Message template')).toHaveValue(
      messages.PremiumWorkspace.defaultMessage,
    )
    fireEvent.change(screen.getByLabelText('Message template'), {
      target: { value: 'Hello {secret}' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('approved placeholders')
    fireEvent.change(screen.getByLabelText('Name for this saved tool'), {
      target: { value: 'Invalid template' },
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
