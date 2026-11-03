import { Children, type ReactElement, type ReactNode } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import LandingPage from './(public)/page'
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
  headers: vi.fn(),
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
vi.mock('next/headers', () => ({ headers: mocks.headers }))
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
vi.mock('@/features/security/components/pin-gate', () => ({
  PinGate: ({ children }: { children: ReactNode }) => <>{children}</>,
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
    mocks.getTranslations.mockResolvedValue((key: string) => `public:${key}`)
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const page = await LandingPage()
    renderIntl(page)
    expect(
      screen.getByRole('heading', { name: 'public:landing.title' }),
    ).toBeVisible()
    for (const cta of screen.getAllByText('public:landing.primaryCta'))
      expect(cta).toBeVisible()
    expect(screen.getByText('public:landing.secondaryCta')).toBeVisible()
  })

  it('logs session lookup errors and still renders public landing actions', async () => {
    mocks.getTranslations.mockResolvedValue((key: string) => `public:${key}`)
    const error = new Error('Session lookup unavailable')
    mocks.getUser.mockResolvedValue({ data: { user: null }, error })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const page = await LandingPage()
    expect(log).toHaveBeenCalledWith(
      'Unable to check session on landing page:',
      error,
    )
    renderIntl(page)
    for (const cta of screen.getAllByText('public:landing.primaryCta'))
      expect(cta).toBeVisible()
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
    mocks.headers.mockResolvedValue(new Headers())
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
    const body = Children.toArray(layout.props.children).find(
      (child) =>
        typeof child === 'object' &&
        child !== null &&
        'type' in child &&
        child.type === 'body',
    ) as ReactElement<{ className?: string; children: ReactNode }>
    expect(body.type).toBe('body')
    expect(body.props.children).toHaveLength(5)
  })

  it('renders the public root without the authenticated device frame', async () => {
    mocks.getLocale.mockResolvedValue('en')
    mocks.getMessages.mockResolvedValue(messages)
    mocks.getTranslations.mockImplementation(async (namespace: string) => {
      if (namespace === 'Settings') return (key: string) => `settings:${key}`
      return (key: string) => `common:${key}`
    })
    mocks.headers.mockResolvedValue(new Headers({ 'x-public-site': 'true' }))
    const layout = await RootLayout({ children: <p>Public content</p> })
    const body = Children.toArray(layout.props.children).find(
      (child) =>
        typeof child === 'object' &&
        child !== null &&
        'type' in child &&
        child.type === 'body',
    ) as ReactElement<{ className?: string; children: ReactNode }>
    const children = Children.toArray(body.props.children)
    expect(body.props.className).toContain('min-h-screen')
    expect(children).toHaveLength(2)
    const publicShell = children[1] as ReactElement<{ children: ReactNode }>
    const publicContent = publicShell.props.children as ReactElement<{
      children: ReactNode
    }>
    expect(publicContent.type).toBe('div')
    expect(publicContent.props.children).toEqual(<p>Public content</p>)
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
    const frame = document.createElement('iframe')
    document.body.append(frame)
    try {
      const root = frame.contentDocument
      if (!root) throw new Error('Unable to create global error test document')
      render(<GlobalError error={error} reset={reset} />, { container: root })
      const content = within(root.body)
      expect(
        content.getByRole('heading', { name: messages.Common.criticalError }),
      ).toBeVisible()
      expect(content.getByText(error.message)).toBeVisible()
      fireEvent.click(content.getByRole('button', { name: 'Try again' }))
      expect(reset).toHaveBeenCalledTimes(2)
      await waitFor(() =>
        expect(mocks.logFatal).toHaveBeenCalledWith(
          'Critical global error caught',
          error,
        ),
      )
    } finally {
      cleanup()
      frame.remove()
    }
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
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('data-page-scroll')
    expect(main).toHaveClass('overflow-y-auto', 'min-h-0', 'scroll-fade-y')
    expect(document.documentElement).toHaveAttribute('data-clipboard-guard')
    expect(main.className).not.toMatch(/pb-\[calc\(6rem/)
    const slot = screen.getByTestId('shell-bottom-slot')
    expect(main.nextElementSibling?.nextElementSibling).toBe(slot)
    expect(slot.nextElementSibling).toHaveTextContent('Bottom nav')
    expect(slot.parentElement?.className).toContain(
      '[--shell-bottom-extra:3rem]',
    )
    expect(main).not.toContainElement(screen.getByText('Top nav'))
    expect(screen.getByText('Bottom nav')).toBeVisible()
    expect(screen.getByText('Compatibility redirect')).toBeVisible()
    expect(
      document.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThan(0)
  })
})
