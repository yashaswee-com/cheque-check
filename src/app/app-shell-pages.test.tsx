import type { ReactNode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import LandingPage from './page'
import RootLayout, { generateMetadata } from './layout'
import ErrorBoundary from './error'
import GlobalError from './global-error'
import DashboardLayout from './(dashboard)/layout'
import DashboardLoading from './(dashboard)/loading'
import PremiumWorkspacePage from './(dashboard)/premium/page'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getLocale: vi.fn(),
  getMessages: vi.fn(),
  getTranslations: vi.fn(),
  redirect: vi.fn(),
  logError: vi.fn(),
  logFatal: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    mocks.redirect(href)
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
}))
vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'font-sans' }),
}))
vi.mock('next/script', () => ({ default: () => null }))
vi.mock('next-intl/server', () => ({
  getLocale: mocks.getLocale,
  getMessages: mocks.getMessages,
  getTranslations: mocks.getTranslations,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: mocks.logError, fatal: mocks.logFatal },
}))
vi.mock('@/components/ui/error-view', () => ({
  ErrorView: ({
    error,
    reset,
    title,
    supportReference,
  }: {
    error: Error
    reset: () => void
    title?: string
    supportReference?: string
  }) => (
    <section>
      {title && <h1>{title}</h1>}
      <p>{error.message}</p>
      {supportReference && <p>{supportReference}</p>}
      <button onClick={reset}>Try again</button>
    </section>
  ),
}))
vi.mock('@/components/providers', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/pwa-registrar', () => ({
  PwaRegistrar: () => null,
}))
vi.mock('@/components/launch-splash', () => ({ LaunchSplash: () => null }))
vi.mock('@/components/progress-bar', () => ({
  ProgressBar: () => <span>Progress</span>,
}))
vi.mock('@/components/ui/toast', () => ({
  Toaster: () => <span>Notifications</span>,
}))
vi.mock('@/components/onboarding-check', () => ({
  OnboardingCheck: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/top-nav', () => ({ TopNav: () => <span>Top nav</span> }))
vi.mock('@/components/bottom-nav', () => ({
  BottomNav: () => <span>Bottom nav</span>,
}))
vi.mock('@/components/scroll-to-top', () => ({
  ScrollToTop: () => <span>Scroll reset</span>,
}))
vi.mock('@/components/ui/page-transition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/app-fab', () => ({
  AppFab: () => <span>App actions</span>,
}))
vi.mock(
  '@/features/premium-workspace/components/premium-compatibility-redirect',
  () => ({
    PremiumCompatibilityRedirect: () => <p>Compatibility redirect</p>,
  }),
)

function renderIntl(children: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('application shell routes', () => {
  it('renders landing actions when there is no signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const page = await LandingPage()
    renderIntl(page)
    expect(screen.getByRole('heading', { name: 'ChequeCheck' })).toBeVisible()
    expect(screen.getByText('Log in')).toBeVisible()
    expect(screen.getByText('Sign up')).toBeVisible()
  })

  it('logs session lookup errors and still renders public landing actions', async () => {
    const error = new Error('Session lookup unavailable')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const page = await LandingPage()
    expect(log).toHaveBeenCalledWith(
      'Unable to check session on landing page:',
      error,
    )
    renderIntl(page)
    expect(screen.getByText('Log in')).toBeVisible()
    log.mockRestore()
  })

  it('redirects authenticated users to the dashboard', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-id' } },
      error: null,
    })
    await expect(LandingPage()).rejects.toThrow('NEXT_REDIRECT:/dashboard')
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard')
  })

  it('builds localized metadata and renders the locale-aware root shell', async () => {
    mocks.getTranslations.mockImplementation(async (namespace: string) => {
      if (namespace === 'Settings') return (key: string) => `settings:${key}`
      return (key: string) => `common:${key}`
    })
    mocks.getLocale.mockResolvedValue('hi')
    mocks.getMessages.mockResolvedValue(messages)
    const metadata = await generateMetadata()
    expect(metadata.description).toBe('settings:appDescription')
    expect(metadata.manifest).toBe('/site.webmanifest')
    expect(
      metadata.appleWebApp && typeof metadata.appleWebApp === 'object'
        ? metadata.appleWebApp.title
        : undefined,
    ).toBe('ChequeCheck')

    const layout = await RootLayout({ children: <p>Application content</p> })
    expect(layout.props.lang).toBe('hi')
    const body = layout.props.children
    expect(body.type).toBe('body')
    expect(body.props.children).toHaveLength(5)
  })

  it('logs errors from both boundaries and exposes reset actions', async () => {
    const reset = vi.fn()
    const error = new Error('Something broke')
    renderIntl(<ErrorBoundary error={error} reset={reset} />)
    expect(screen.getByText(error.message)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(mocks.logError).toHaveBeenCalledWith(
        'Global error caught by error boundary',
        error,
      ),
    )

    cleanup()
    render(<GlobalError error={error} reset={reset} />)
    expect(
      screen.getByRole('heading', { name: messages.Common.criticalError }),
    ).toBeVisible()
    expect(screen.getByText(error.message)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reset).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(mocks.logFatal).toHaveBeenCalledWith(
        'Critical global error caught',
        error,
      ),
    )
  })

  it('composes dashboard content and provides a loading skeleton', () => {
    renderIntl(
      <>
        <DashboardLayout>
          <p>Dashboard child</p>
        </DashboardLayout>
        <DashboardLoading />
        <PremiumWorkspacePage />
      </>,
    )
    expect(screen.getByText('Dashboard child')).toBeVisible()
    expect(screen.getByText('Top nav')).toBeVisible()
    expect(screen.getByText('Bottom nav')).toBeVisible()
    expect(screen.getByText('Compatibility redirect')).toBeVisible()
    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
  })
})
