import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeTools } from './native-tools'
import { PremiumWorkspace } from './workspace'
import { useWorkspaceContext } from '../hooks/use-workspace'

const state = vi.hoisted(() => ({
  business: {
    activeBusiness: { id: 'b1', name: 'First' } as {
      id: string
      name: string
    } | null,
    businesses: [
      { id: 'b1', name: 'First' },
      { id: 'b2', name: 'Second' },
    ],
    isLoading: false,
    setActiveBusiness: vi.fn(),
  },
  profile: { currency: '$' } as { currency: string } | null,
  context: {
    data: { cheques: [], parties: [], accounts: [] } as object | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  tools: {
    data: [
      { id: 'template', kind: 'cheque-template' },
      { id: 'view', kind: 'saved-view' },
      { id: 'message', kind: 'message-template' },
    ] as { id: string; kind: string }[] | undefined,
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
    refetch: vi.fn(),
  },
  action: {
    busy: false,
    notice: null as null | 'success' | 'error',
    setNotice: vi.fn(),
    run: vi.fn(),
  },
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => state.business,
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: state.profile }),
}))
vi.mock('../hooks/use-workspace', () => ({
  useWorkspaceContext: vi.fn(() => state.context),
  useWorkspaceTools: vi.fn(() => state.tools),
}))
vi.mock('../hooks/use-workspace-action', () => ({
  useWorkspaceAction: () => state.action,
}))
vi.mock('@/features/monetization/components/premium-gate', () => ({
  PremiumGate: ({
    feature,
    children,
  }: {
    feature: string
    children: ReactNode
  }) => <div data-testid={`gate-${feature}`}>{children}</div>,
}))
vi.mock('@/features/cheques/components/print-layout-editor', () => ({
  PrintLayoutEditor: ({ accountId }: { accountId: string }) => (
    <p>Print {accountId}</p>
  ),
}))
vi.mock('./import-panel', () => ({
  ImportPanel: ({ initialKind = 'parties' }: { initialKind?: string }) => (
    <p>Import {initialKind}</p>
  ),
}))
vi.mock('./templates-panel', () => ({
  TemplatesPanel: ({ tools }: { tools: { id: string }[] }) => (
    <p>Templates {tools.map((t) => t.id).join(',')}</p>
  ),
}))
vi.mock('./filters-panel', () => ({
  FiltersPanel: ({
    mode,
    currency,
    tools,
  }: {
    mode: string
    currency: string
    tools: { id: string }[]
  }) => (
    <p>
      Filters {mode} {currency} {tools.map((t) => t.id).join(',')}
    </p>
  ),
}))
vi.mock('./reports-panel', () => ({
  ReportsPanel: ({
    mode,
    onlyPartyId,
    initialPartyId,
  }: {
    mode: string
    onlyPartyId?: string
    initialPartyId?: string
  }) => (
    <p>
      Reports {mode} {onlyPartyId ?? initialPartyId}
    </p>
  ),
}))
vi.mock('./message-panel', () => ({
  MessagePanel: ({ tools }: { tools: { id: string }[] }) => (
    <p>Messages {tools.map((t) => t.id).join(',')}</p>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  state.business.activeBusiness = { id: 'b1', name: 'First' }
  state.business.businesses = [
    { id: 'b1', name: 'First' },
    { id: 'b2', name: 'Second' },
  ]
  state.business.isLoading = false
  state.profile = { currency: '$' }
  state.context.data = { cheques: [], parties: [], accounts: [] }
  state.context.isPending = state.context.isError = false
  state.tools.isPending = state.tools.isError = false
  state.tools.data = [
    { id: 'template', kind: 'cheque-template' },
    { id: 'view', kind: 'saved-view' },
    { id: 'message', kind: 'message-template' },
  ]
  state.tools.fetchStatus = 'idle'
  state.action.busy = false
  state.action.notice = null
})
afterEach(cleanup)

describe('PremiumWorkspace navigation', () => {
  it('supports business loading and absence before showing tools', () => {
    state.business.isLoading = true
    const { rerender } = render(<PremiumWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    state.business.isLoading = false
    state.business.activeBusiness = null
    rerender(<PremiumWorkspace />)
    expect(screen.getByText('noBusiness')).toBeVisible()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('handles context loading, errors, and retrying both queries', () => {
    state.context.isPending = true
    const { rerender } = render(<PremiumWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    state.context.isPending = false
    state.tools.isError = true
    rerender(<PremiumWorkspace />)
    expect(screen.getByRole('alert')).toHaveTextContent('loadError')
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(state.context.refetch).toHaveBeenCalledOnce()
    expect(state.tools.refetch).toHaveBeenCalledOnce()
  })

  it('selects all feature tabs and forwards only their saved tools', () => {
    render(<PremiumWorkspace />)
    expect(screen.getByTestId('gate-bulk-import')).toHaveTextContent(
      'Import parties',
    )
    const tabs = [
      ['templates', 'cheque-templates', 'Templates template'],
      ['bulk', 'bulk-actions', 'Filters bulk $ view'],
      ['views', 'saved-views', 'Filters views $ view'],
      ['statements', 'party-statements', 'Reports statement'],
      ['consolidated', 'consolidated-dashboard', 'Reports consolidated'],
      ['messages', 'message-templates', 'Messages message'],
      ['import', 'bulk-import', 'Import parties'],
    ]
    for (const [tab, feature, text] of tabs) {
      fireEvent.click(screen.getByRole('button', { name: `tabs.${tab}` }))
      expect(screen.getByTestId(`gate-${feature}`)).toHaveTextContent(text)
      expect(window.location.hash).toBe(`#${feature}`)
      expect(
        screen.getByRole('button', { name: `tabs.${tab}` }),
      ).toHaveAttribute('aria-pressed', 'true')
    }
    expect(state.action.setNotice).toHaveBeenCalledTimes(7)
  })

  it('honors bookmarked statement parties and switches businesses', () => {
    window.history.replaceState(null, '', '/?partyId=p7#party-statements')
    render(<PremiumWorkspace />)
    expect(screen.getByText('Reports statement p7')).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: 'business' }), {
      target: { value: 'b2' },
    })
    expect(state.business.setActiveBusiness).toHaveBeenCalledWith({
      id: 'b2',
      name: 'Second',
    })
    window.history.replaceState(null, '', '/#message-templates')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByText('Messages message')).toBeVisible()
  })

  it('disables tab changes while working and exposes operation failures', () => {
    state.action.busy = true
    state.action.notice = 'error'
    render(<PremiumWorkspace />)
    expect(screen.getByRole('alert')).toHaveTextContent('operationError')
    expect(screen.getByText('working')).toBeVisible()
    expect(screen.getByRole('button', { name: 'tabs.views' })).toBeDisabled()
  })
})

describe('NativeTools destinations', () => {
  function activate(container: HTMLElement) {
    const details = container.querySelector('details')
    if (!details) throw new Error('Expected a tool section')
    details.open = true
    fireEvent(details, new Event('toggle'))
  }

  it('does not fetch workspace data for closed tool headings', () => {
    const { container } = render(<NativeTools destination="cheques" />)
    expect(useWorkspaceContext).not.toHaveBeenCalled()
    expect(container.querySelectorAll('details')).toHaveLength(4)
    activate(container)
    expect(useWorkspaceContext).toHaveBeenCalled()
  })
  it.each([
    [
      'cheques',
      ['bulk-import', 'cheque-templates', 'saved-views', 'bulk-actions'],
    ],
    ['parties', ['bulk-import', 'party-statements']],
    ['party', ['party-statements']],
    ['business', ['message-templates']],
    ['businesses', ['consolidated-dashboard']],
  ] as const)('wires premium boundaries for %s', (destination, gates) => {
    const { container } = render(
      <NativeTools destination={destination} partyId="p1" />,
    )
    activate(container)
    for (const gate of gates)
      expect(screen.getByTestId(`gate-${gate}`)).toBeInTheDocument()
    expect(screen.getAllByTestId(/^gate-/)).toHaveLength(gates.length)
    if (destination === 'party')
      expect(screen.getByText('Reports statement p1')).toBeInTheDocument()
  })

  it('exposes account print settings without workspace queries', () => {
    const { rerender, container } = render(
      <NativeTools destination="account" />,
    )
    expect(container).toBeEmptyDOMElement()
    rerender(<NativeTools destination="account" accountId="a1" />)
    expect(screen.getByText('Print a1')).toBeInTheDocument()
  })

  it('reports no business and supports explicitly supplied business options', () => {
    state.business.activeBusiness = null
    state.business.businesses = []
    const { rerender, container } = render(
      <NativeTools destination="businesses" />,
    )
    expect(screen.getByText('noBusiness')).toBeInTheDocument()
    rerender(
      <NativeTools
        destination="businesses"
        businesses={[{ id: 'b3', name: 'Third' }]}
      />,
    )
    activate(container)
    expect(screen.getByText('Reports consolidated')).toBeInTheDocument()
  })

  it('retries failed active queries while ignoring disabled tools queries', () => {
    state.tools.isError = true
    const { rerender, container } = render(<NativeTools destination="party" />)
    activate(container)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    state.context.isError = true
    rerender(<NativeTools destination="party" />)
    fireEvent.click(screen.getByRole('button', { name: 'retry' }))
    expect(state.context.refetch).toHaveBeenCalledOnce()
    expect(state.tools.refetch).toHaveBeenCalledOnce()
    state.context.isError = false
    state.tools.fetchStatus = 'fetching'
    rerender(<NativeTools destination="party" />)
    expect(screen.getByRole('alert')).toHaveTextContent('loadError')
  })

  it('renders tool destinations from an explicit business without an active one', () => {
    state.business.activeBusiness = null
    state.business.businesses = []
    for (const [destination, section, expected] of [
      ['parties', 'bulk-import', 'Import parties'],
      ['party', 'party-statements', 'Reports statement'],
      ['business', 'message-templates', 'Messages'],
      ['businesses', 'consolidated-dashboard', 'Reports consolidated'],
    ] as const) {
      window.history.replaceState(null, '', `/#${section}`)
      const { container, unmount } = render(
        <NativeTools destination={destination} businessId="b1" />,
      )
      expect(container).toHaveTextContent(expected)
      unmount()
    }
  })

  it('uses empty saved tools and the default currency while reporting action state', () => {
    state.profile = null
    state.tools.data = undefined
    state.action.busy = true
    state.action.notice = 'success'
    window.history.replaceState(null, '', '/#saved-views')
    const { rerender } = render(<NativeTools destination="cheques" />)
    expect(screen.getByText('Filters views ₹')).toBeInTheDocument()
    expect(screen.getByText('operationSuccess')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getAllByRole('status')).toHaveLength(2)
    state.action.notice = 'error'
    rerender(<NativeTools destination="cheques" />)
    expect(screen.getByRole('alert')).toHaveTextContent('operationError')
  })

  it('shows pending active queries and waits for actual workspace data', () => {
    state.tools.isPending = true
    state.tools.fetchStatus = 'fetching'
    const { rerender, container } = render(
      <NativeTools destination="cheques" />,
    )
    activate(container)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
    state.tools.isPending = false
    state.context.data = undefined
    rerender(<NativeTools destination="cheques" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('synchronizes expandable tools with hash navigation', () => {
    window.history.replaceState(null, '', '/#bulk-import')
    const { container } = render(<NativeTools destination="cheques" />)
    expect(container.querySelector('#bulk-import')).toHaveAttribute('open')
    window.history.replaceState(null, '', '/#saved-views')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(container.querySelector('#saved-views')).toHaveAttribute('open')
    expect(container.querySelector('#bulk-import')).not.toHaveAttribute('open')
  })
})
