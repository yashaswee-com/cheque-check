import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PremiumButton,
  PremiumField,
  PremiumLink,
  PremiumSwitch,
  PremiumTab,
  PremiumTabs,
} from './premium-controls'
import { PremiumPromptProvider } from './premium-prompt'
import { PREMIUM_FEATURES, type PremiumState } from '../lib/premium-access'
import english from '../../../../messages/en.json'
import hindi from '../../../../messages/hi.json'
import hinglish from '../../../../messages/hi-en.json'

const mocks = vi.hoisted(() => ({
  state: 'free' as PremiumState,
  refresh: vi.fn(),
  push: vi.fn(),
}))
vi.mock('../hooks/use-premium-access', () => ({
  usePremiumAccess: () => ({
    state: mocks.state,
    isLoading: mocks.state === 'loading',
    canUse: () => mocks.state === 'active' || mocks.state === 'trialing',
    refresh: mocks.refresh,
  }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state = 'free'
  mocks.refresh.mockResolvedValue({})
})

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={english}>
      <PremiumPromptProvider>{children}</PremiumPromptProvider>
    </NextIntlClientProvider>
  )
}

describe('Premium controls', () => {
  it.each(PREMIUM_FEATURES)('opens the contextual sheet for %s', (feature) => {
    const action = vi.fn()
    render(
      <PremiumButton feature={feature} onClick={action}>
        Use tool
      </PremiumButton>,
      {
        wrapper: Wrapper,
      },
    )
    const button = screen.getByRole('button', { name: 'Use tool' })
    expect(
      button.querySelector('[data-slot="premium-mark"]'),
    ).toBeInTheDocument()
    fireEvent.click(button)
    const sheet = screen.getByRole('dialog')
    expect(sheet).toHaveAccessibleName(english.Premium.features[feature])
    expect(sheet).toHaveTextContent(english.Premium.descriptions[feature])
    expect(action).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: english.Premium.viewPlan }),
    )
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/features/catalog')
  })

  it.each(['active', 'trialing'] as const)(
    'keeps markers and invokes native actions synchronously for %s access',
    (state) => {
      mocks.state = state
      const action = vi.fn()
      render(
        <PremiumButton feature="contact-import" onClick={action}>
          Import
        </PremiumButton>,
        {
          wrapper: Wrapper,
        },
      )
      const button = screen.getByRole('button', { name: 'Import' })
      expect(
        button.querySelector('[data-slot="premium-mark"]'),
      ).toBeInTheDocument()
      fireEvent.click(button)
      expect(action).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it('does not turn disabled controls into upgrade triggers', () => {
    render(
      <PremiumButton feature="reports" disabled>
        Export
      </PremiumButton>,
      {
        wrapper: Wrapper,
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('changes context between actions and dismisses without executing either', () => {
    const action = vi.fn()
    render(
      <>
        <PremiumButton feature="contact-import" onClick={action}>
          Import
        </PremiumButton>
        <PremiumButton feature="reports" onClick={action}>
          Reports
        </PremiumButton>
      </>,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(
      screen.getByRole('button', { name: english.Common.maybeLater }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      english.Premium.features.reports,
    )
    expect(action).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each(['loading', 'error', 'paused', 'canceled', 'expired'] as const)(
    'blocks %s access with an explicit state',
    (state) => {
      mocks.state = state
      const action = vi.fn()
      render(
        <PremiumButton feature="reports" onClick={action}>
          Reports
        </PremiumButton>,
        {
          wrapper: Wrapper,
        },
      )
      fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
      expect(screen.getByRole('dialog')).toHaveTextContent(
        english.Premium.states[state],
      )
      expect(action).not.toHaveBeenCalled()
      if (state === 'loading' || state === 'error') {
        expect(
          screen.queryByRole('button', { name: english.Premium.viewPlan }),
        ).not.toBeInTheDocument()
      }
      if (state === 'paused') {
        fireEvent.click(
          screen.getByRole('button', { name: english.Premium.contactSupport }),
        )
        expect(mocks.push).toHaveBeenCalledWith('/settings/help-and-support')
      }
    },
  )

  it('retries access without automatically executing the original action', async () => {
    mocks.state = 'error'
    mocks.refresh.mockImplementation(async () => {
      mocks.state = 'active'
    })
    const action = vi.fn()
    render(
      <PremiumButton feature="reports" onClick={action}>
        Reports
      </PremiumButton>,
      {
        wrapper: Wrapper,
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    fireEvent.click(screen.getByRole('button', { name: english.Premium.retry }))
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveTextContent(
        english.Premium.states.active,
      ),
    )
    fireEvent.click(
      screen.getByRole('button', { name: english.Common.continue }),
    )
    expect(action).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Reports' }))
    expect(action).toHaveBeenCalledOnce()
  })

  it('intercepts locked links without navigating or calling their actions', () => {
    const action = vi.fn()
    render(
      <PremiumLink feature="reports" href="/reports" onClick={action}>
        Reports
      </PremiumLink>,
      {
        wrapper: Wrapper,
      },
    )
    const link = screen.getByRole('link', { name: 'Reports' })
    expect(link).toHaveAttribute('href', '/reports')
    expect(fireEvent.click(link)).toBe(false)
    expect(action).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      english.Premium.features.reports,
    )
  })

  it('lets users disable a paid preference without access but blocks enabling it', () => {
    const change = vi.fn()
    const view = render(
      <PremiumSwitch
        feature="notify-party"
        checked
        aria-label="Party SMS"
        onCheckedChange={change}
      />,
      {
        wrapper: Wrapper,
      },
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Party SMS' }))
    expect(change).toHaveBeenCalledWith(false, expect.anything())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.rerender(
      <PremiumSwitch
        feature="notify-party"
        checked={false}
        aria-label="Party SMS"
        onCheckedChange={change}
      />,
    )
    change.mockClear()
    fireEvent.click(screen.getByRole('switch', { name: 'Party SMS' }))
    expect(change).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      english.Premium.features['notify-party'],
    )
  })

  it('replaces locked field controls with an accessible Premium trigger', () => {
    render(
      <PremiumField feature="cheque-printing" label="Print layout">
        <input aria-label="Payee X" />
      </PremiumField>,
      { wrapper: Wrapper },
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Print layout' }))
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      english.Premium.features['cheque-printing'],
    )
  })

  it('preserves paid field controls for trial access', () => {
    mocks.state = 'trialing'
    render(
      <PremiumField feature="cheque-printing" label="Print layout">
        <input aria-label="Payee X" />
      </PremiumField>,
      { wrapper: Wrapper },
    )
    expect(screen.getByRole('textbox', { name: 'Payee X' })).toBeEnabled()
    expect(
      screen
        .getByRole('group', { name: 'Print layout' })
        .querySelector('[data-slot="premium-mark"]'),
    ).toBeInTheDocument()
  })

  it('guards tab activation by keyboard without selecting a locked option', async () => {
    const user = userEvent.setup()
    const change = vi.fn()
    render(
      <PremiumTabs
        defaultValue="Outward"
        featureByValue={{ Inward: 'inward-tracking' }}
        onValueChange={change}
      >
        <TabsList>
          <TabsTrigger value="Outward">Issued</TabsTrigger>
          <PremiumTab feature="inward-tracking" value="Inward">
            Received
          </PremiumTab>
        </TabsList>
      </PremiumTabs>,
      { wrapper: Wrapper },
    )
    const outward = screen.getByRole('tab', { name: 'Issued' })
    const inward = screen.getByRole('tab', { name: 'Received' })
    await user.click(outward)
    await user.keyboard('{ArrowRight}')
    expect(inward).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(change).not.toHaveBeenCalled()
    expect(outward).toHaveAttribute('aria-selected', 'true')
    expect(inward).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      english.Premium.features['inward-tracking'],
    )
  })

  it('preserves the existing inward-record editing exemption', () => {
    const change = vi.fn()
    render(
      <PremiumTabs
        defaultValue="Outward"
        featureByValue={{ Inward: 'inward-tracking' }}
        exemptValues={['Inward']}
        onValueChange={change}
      >
        <TabsList>
          <TabsTrigger value="Outward">Issued</TabsTrigger>
          <PremiumTab feature="inward-tracking" value="Inward">
            Received
          </PremiumTab>
        </TabsList>
      </PremiumTabs>,
      { wrapper: Wrapper },
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Received' }))
    expect(change).toHaveBeenCalledWith('Inward', expect.anything())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['en', english],
    ['hi', hindi],
    ['hi-en', hinglish],
  ] as const)(
    'localizes markers and all action descriptions in %s',
    (locale, catalog) => {
      for (const feature of PREMIUM_FEATURES) {
        expect(catalog.Premium.descriptions[feature]).toBeTruthy()
      }
      render(
        <NextIntlClientProvider locale={locale} messages={catalog}>
          <PremiumPromptProvider>
            <PremiumButton feature="contact-import">Import</PremiumButton>
          </PremiumPromptProvider>
        </NextIntlClientProvider>,
      )
      const button = screen.getByRole('button', { name: 'Import' })
      expect(button).toHaveAttribute('aria-description', catalog.Premium.marker)
      fireEvent.click(button)
      expect(screen.getByRole('dialog')).toHaveAccessibleName(
        catalog.Premium.features['contact-import'],
      )
      expect(screen.getByRole('dialog')).toHaveTextContent(
        catalog.Premium.descriptions['contact-import'],
      )
    },
  )
})
