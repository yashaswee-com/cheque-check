import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons'
import messages from '../../messages/en.json'
import { version } from '../../package.json'
import { stubWindowReload } from '@/test/browser'
import { TopNav } from './top-nav'
import { BottomNav } from './bottom-nav'
import { SpeedDialFab } from './speed-dial-fab'
import { OnboardingCheck } from './onboarding-check'
import { AppShellSkeleton } from './app-shell-skeleton'
import { LaunchSplash } from './launch-splash'
import Providers from './providers'
import { ScrollToTop } from './scroll-to-top'
import { PwaRegistrar } from './pwa-registrar'

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  businessSwitch: vi.fn(),
  profileProvider: vi.fn(),
  businessProvider: vi.fn(),
  monitoring: vi.fn(),
  celebrations: vi.fn(),
  scrollTo: vi.fn(),
}))
let pathname = '/cheques/cheque-id'
let keyboard = false
vi.mock('@/features/notifications/components/push-account-guard', () => ({
  PushAccountGuard: () => null,
}))
vi.mock('@/features/announcements/components/developer-message', () => ({
  DeveloperMessage: () => null,
}))
vi.mock('@/features/notifications/hooks/use-inbox', () => ({
  useUnreadCount: () => ({ data: 0, error: null }),
}))
let activeBusiness: {
  id: string
  name: string
  logo_url: string | null
} | null = null
let profile: { name: string | null; avatar_url: string | null } | null = null
let businessState = {
  businesses: [{ id: 'business', name: 'Acme' }],
  isLoading: false,
  isFetching: false,
}

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile }),
  ProfileProvider: ({ children }: { children: React.ReactNode }) => {
    mocks.profileProvider()
    return <div data-testid="profile-provider">{children}</div>
  },
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness, ...businessState }),
  BusinessProvider: ({ children }: { children: React.ReactNode }) => {
    mocks.businessProvider()
    return <div data-testid="business-provider">{children}</div>
  },
}))
vi.mock('@/hooks/use-software-keyboard', () => ({
  useSoftwareKeyboard: () => keyboard,
}))
vi.mock('@/components/business-switcher', () => ({
  BusinessSwitcher: ({ trigger }: { trigger: React.ReactNode }) => (
    <div>{trigger}</div>
  ),
}))
vi.mock('@/components/calculator', () => ({
  Calculator: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      Calculator <button onClick={onClose}>Close calculator</button>
    </div>
  ),
}))
vi.mock('@/components/global-search', () => ({
  GlobalSearch: ({
    open,
    onOpenChange,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
  }) =>
    open ? (
      <div role="dialog">
        Search <button onClick={() => onOpenChange(false)}>Close search</button>
      </div>
    ) : null,
}))
vi.mock('@/components/celebration-host', () => ({
  CelebrationHost: () => {
    mocks.celebrations()
    return <span>Celebration host</span>
  },
}))
vi.mock('@/components/monitoring-provider', () => ({
  MonitoringProvider: () => {
    mocks.monitoring()
    return <span>Monitoring provider</span>
  },
}))

function renderIntl(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  pathname = '/cheques/cheque-id'
  keyboard = false
  activeBusiness = null
  profile = { name: 'A User', avatar_url: null }
  businessState = {
    businesses: [{ id: 'business', name: 'Acme' }],
    isLoading: false,
    isFetching: false,
  }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('navigation components', () => {
  it('updates optimistic active tabs and resets them when the real route changes', () => {
    const view = renderIntl(<BottomNav />)
    const parties = screen.getByTestId('bottom-nav-parties')
    expect(parties).toHaveAttribute('href', '/parties')
    parties.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    })
    fireEvent.click(parties)
    expect(parties).toHaveAttribute('aria-current', 'page')
    expect(screen.getByTestId('bottom-nav-cheques')).not.toHaveAttribute(
      'aria-current',
    )

    pathname = '/parties'
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <BottomNav />
      </NextIntlClientProvider>,
    )
    expect(screen.getByTestId('bottom-nav-parties')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each([
    ['', 'ChequeCheck'],
    ['/', 'ChequeCheck'],
    ['/dashboard', messages.Navigation.dashboard],
    ['/settings', messages.Navigation.settings],
    ['/features/catalog', messages.Navigation.features],
    ['/feedback', messages.Feedback.submitTitle],
    ['/roadmap', messages.Feedback.roadmapTitle],
    ['/profile', messages.Settings.profile],
    ['/settings/privacy-policy', messages.Settings.privacyPolicy],
    ['/settings/terms-and-conditions', messages.Settings.termsAndConditions],
    ['/settings/refund-policy', messages.Settings.refundPolicy],
    ['/settings/about', messages.Settings.aboutApp],
    ['/settings/help-and-support', messages.Settings.helpAndSupport],
    ['/settings/whats-new', messages.Settings.whatsNew],
    ['/settings/preferences', messages.Settings.preferences],
    ['/settings/notifications', messages.Settings.notifications],
    ['/settings/transactions', messages.Settings.transactions],
    ['/cheques', messages.Cheques.title],
    ['/accounts', messages.Accounts.title],
    ['/parties', messages.Parties.title],
    ['/businesses', messages.Businesses.title],
    ['/tags', messages.Tags.title],
    ['/cheques/create', messages.Cheques.newCheque],
    ['/accounts/create', messages.Accounts.addAccount],
    ['/parties/create', messages.Parties.newParty],
    ['/businesses/create', messages.Businesses.newBusiness],
    ['/tags/create', messages.Tags.newTag],
    ['/cheques/drafts', messages.Drafts.chequeDrafts],
    ['/accounts/drafts', messages.Drafts.accountDrafts],
    ['/parties/drafts', messages.Drafts.partyDrafts],
    ['/cheques/one/edit', messages.Cheques.editCheque],
    ['/tags/one', messages.Tags.viewTag],
    ['/settings/unknown', 'Settings'],
    ['/businesses/drafts', messages.Businesses.viewBusiness],
    ['/tags/one/archive', messages.Navigation.dashboard],
    ['/unlisted', 'Unlisted'],
  ])(
    'shows the correct title and navigation controls for %s',
    (route, title) => {
      pathname = route
      renderIntl(<TopNav />)
      expect(screen.getByText(title, { exact: true })).toBeVisible()
      if (
        [
          '/dashboard',
          '/settings',
          '/features/catalog',
          '/profile',
          '/cheques',
          '/accounts',
          '/parties',
          '/businesses',
          '/tags',
          '/feedback',
          '/roadmap',
        ].includes(route)
      ) {
        expect(
          screen.queryByRole('button', { name: messages.SharedUI.back }),
        ).not.toBeInTheDocument()
      } else {
        expect(
          screen.getByRole('button', { name: messages.SharedUI.back }),
        ).toBeVisible()
      }
    },
  )

  it('switches business icons, opens search/calculator, and hides restricted menu actions', async () => {
    const user = userEvent.setup()
    pathname = '/cheques'
    activeBusiness = {
      id: 'business',
      name: 'Acme',
      logo_url: 'https://example.test/logo.png',
    }
    renderIntl(<TopNav />)
    expect(screen.getByTestId('business-switcher-trigger')).toHaveAttribute(
      'data-active-business-name',
      'Acme',
    )
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.search }),
    )
    expect(screen.getByRole('dialog', { name: undefined })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.calculator }),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('Calculator')
    fireEvent.click(screen.getByRole('button', { name: 'Close calculator' }))
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )
    expect(
      screen.getByRole('link', { name: messages.Navigation.settings }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: messages.SharedUI.reload }),
    ).toBeVisible()

    cleanup()
    pathname = '/settings'
    renderIntl(<TopNav />)
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )
    expect(
      screen.queryByRole('button', { name: messages.SharedUI.reload }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('business-switcher-trigger'),
    ).not.toBeInTheDocument()
  })

  it('shows profile and business initials when their image URLs are absent or names are missing', () => {
    pathname = '/cheques'
    profile = { name: null, avatar_url: 'https://example.test/avatar.png' }
    activeBusiness = {
      id: 'business',
      name: 'Acme',
      logo_url: null,
    }

    renderIntl(<TopNav />)
    fireEvent.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )

    expect(screen.getByRole('img', { name: 'User' })).toHaveAttribute(
      'src',
      'https://example.test/avatar.png',
    )
    expect(screen.getByTestId('business-switcher-trigger')).toHaveTextContent(
      'A',
    )
  })

  it('uses the back button and closes the More menu after navigating to settings', async () => {
    const user = userEvent.setup()
    pathname = '/cheques/one'
    renderIntl(<TopNav />)
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.back }),
    )
    expect(mocks.back).toHaveBeenCalledOnce()

    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )
    const settings = screen.getByRole('link', {
      name: messages.Navigation.settings,
    })
    expect(settings).toHaveAttribute('href', '/settings')
    settings.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    })
    await user.click(settings)
    expect(settings).not.toBeVisible()
  })

  it('reloads from the More menu on routes that expose the reload action', async () => {
    const user = userEvent.setup()
    pathname = '/cheques'
    renderIntl(<TopNav />)

    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    )
    const reload = stubWindowReload()
    await user.click(
      screen.getByRole('button', { name: messages.SharedUI.reload }),
    )

    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('shell state components', () => {
  it('routes unconfigured workspaces to onboarding and keeps loaded children', async () => {
    businessState = { businesses: [], isLoading: true, isFetching: false }
    const view = renderIntl(
      <OnboardingCheck>
        <p>Workspace</p>
      </OnboardingCheck>,
    )
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()

    businessState = { businesses: [], isLoading: false, isFetching: false }
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OnboardingCheck>
          <p>Workspace</p>
        </OnboardingCheck>
      </NextIntlClientProvider>,
    )
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/onboarding'))
    expect(screen.getByText('Workspace')).toBeVisible()

    pathname = '/onboarding'
    mocks.push.mockClear()
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OnboardingCheck>
          <p>Workspace</p>
        </OnboardingCheck>
      </NextIntlClientProvider>,
    )
    await act(async () => {})
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps the skeleton during an empty background fetch and shows existing workspaces', () => {
    businessState = { businesses: [], isLoading: false, isFetching: true }
    const view = renderIntl(
      <OnboardingCheck>
        <p>Workspace</p>
      </OnboardingCheck>,
    )
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()

    businessState = {
      businesses: [{ id: 'business', name: 'Acme' }],
      isLoading: false,
      isFetching: true,
    }
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <OnboardingCheck>
          <p>Workspace</p>
        </OnboardingCheck>
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Workspace')).toBeVisible()
  })

  it('renders the shell skeleton and shows then dismisses the launch splash', () => {
    renderIntl(<AppShellSkeleton />)
    expect(document.querySelector('[aria-busy="true"]')).toHaveAttribute(
      'aria-live',
      'polite',
    )
    expect(document.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(20)
    cleanup()

    vi.useFakeTimers()
    render(<LaunchSplash />)
    expect(screen.getByTestId('launch-splash')).toHaveTextContent('ChequeCheck')
    expect(screen.getByTestId('launch-splash')).toHaveTextContent(`v${version}`)
    act(() => vi.advanceTimersByTime(900))
    expect(screen.queryByTestId('launch-splash')).not.toBeInTheDocument()
  })

  it('composes application providers around a persistent query context', () => {
    renderIntl(
      <Providers>
        <p>Application</p>
      </Providers>,
    )
    expect(screen.getByText('Application')).toBeVisible()
    expect(screen.getByText('Monitoring provider')).toBeVisible()
    expect(screen.getByText('Celebration host')).toBeVisible()
    expect(mocks.profileProvider).toHaveBeenCalledOnce()
    expect(mocks.businessProvider).toHaveBeenCalledOnce()
  })

  it('scrolls to the top on route changes', () => {
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: mocks.scrollTo,
    })
    const view = renderIntl(<ScrollToTop />)
    expect(mocks.scrollTo).toHaveBeenCalledWith(0, 0)
    mocks.scrollTo.mockClear()
    pathname = '/parties'
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ScrollToTop />
      </NextIntlClientProvider>,
    )
    expect(mocks.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('registers a service worker and logs registration failures', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/app/' })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = render(<PwaRegistrar />)
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      }),
    )

    const registrationError = new Error('registration denied')
    register.mockRejectedValueOnce(registrationError)
    view.rerender(<PwaRegistrar key="retry" />)
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Service Worker registration failed:',
        registrationError,
      ),
    )
    error.mockRestore()
  })

  it('does nothing when the browser has no service worker API', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    render(<PwaRegistrar />)
    expect('serviceWorker' in navigator).toBe(false)
  })
})

describe('speed dial actions', () => {
  it('keeps the menu closed and shows the shared spinner until an action completes', async () => {
    const task = Promise.withResolvers<void>()
    const action = vi.fn(() => task.promise)
    renderIntl(
      <SpeedDialFab
        editHref="/cheques/one/edit"
        editLabel="Edit cheque"
        actions={[{ label: 'Print cheque', icon: Add01Icon, onClick: action }]}
      />,
    )
    const toggle = screen.getByTestId('speed-dial-toggle')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Print cheque' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-busy', 'true')
    expect(toggle).toBeDisabled()
    expect(toggle.querySelectorAll('.animate-spin')).toHaveLength(1)
    fireEvent.click(toggle)
    expect(action).toHaveBeenCalledOnce()
    await act(async () => task.resolve())
    expect(toggle).toBeEnabled()
    expect(toggle).not.toHaveAttribute('aria-busy')
  })

  it('represents externally owned pending actions on the closed menu trigger', () => {
    renderIntl(
      <SpeedDialFab
        editHref="/cheques/one/edit"
        editLabel="Edit cheque"
        actions={[
          {
            label: 'Clear cheque',
            icon: Add01Icon,
            onClick: vi.fn(),
            loading: true,
          },
        ]}
      />,
    )
    expect(screen.getByTestId('speed-dial-toggle')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByTestId('speed-dial-toggle')).toBeDisabled()
  })

  it('opens actions, closes on Escape or backdrop, and calls the selected action', async () => {
    const user = userEvent.setup()
    const edit = screen.queryByTestId('speed-dial-edit-link')
    expect(edit).not.toBeInTheDocument()
    const onDelete = vi.fn()
    renderIntl(
      <SpeedDialFab
        editHref="/cheques/one/edit"
        editLabel="Edit cheque"
        actions={[
          { label: 'Add note', icon: Add01Icon, onClick: vi.fn() },
          {
            label: 'Delete cheque',
            icon: Delete02Icon,
            onClick: onDelete,
            destructive: true,
            testId: 'delete-cheque',
          },
          {
            label: 'Disabled action',
            icon: Add01Icon,
            onClick: vi.fn(),
            disabled: true,
          },
        ]}
      />,
    )
    expect(screen.getByTestId('speed-dial-edit-link')).toHaveAttribute(
      'href',
      '/cheques/one/edit',
    )
    const toggle = screen.getByTestId('speed-dial-toggle')
    await user.click(toggle)
    expect(screen.getByRole('menu')).toBeVisible()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBeVisible()
    expect(
      screen.getByRole('menuitem', { name: 'Disabled action' }),
    ).toBeDisabled()
    await user.click(screen.getByTestId('delete-cheque'))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await user.click(toggle)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await user.click(toggle)
    fireEvent.click(document.querySelector('[aria-hidden="true"]')!)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('omits the menu trigger when there are no secondary actions', () => {
    renderIntl(
      <SpeedDialFab editHref="/parties/one/edit" editLabel="Edit party" />,
    )
    expect(screen.queryByTestId('speed-dial-toggle')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit party' })).toHaveAttribute(
      'href',
      '/parties/one/edit',
    )
  })
})
