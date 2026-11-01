import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/en.json'
import { BottomNav } from './bottom-nav'
import { TopNav } from './top-nav'
import { AppFab } from './app-fab'

let pathname = '/cheques/cheque-id'
let keyboard = false
vi.mock('@/features/notifications/hooks/use-inbox', () => ({
  useUnreadCount: () => ({ data: 0, error: null }),
}))
const back = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ back, push: vi.fn() }),
}))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: null }),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({ activeBusiness: null }),
}))
vi.mock('@/hooks/use-software-keyboard', () => ({
  useSoftwareKeyboard: () => keyboard,
}))
afterEach(cleanup)
beforeEach(() => {
  pathname = '/cheques/cheque-id'
  keyboard = false
  back.mockClear()
})

function shell() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TopNav />
      <AppFab />
      <BottomNav />
    </NextIntlClientProvider>,
  )
}

describe('shared navigation shell', () => {
  it('keeps bottom navigation on details and exposes named back/search/More actions', () => {
    shell()
    expect(
      screen.getByRole('navigation', {
        name: messages.SharedUI.mainNavigation,
      }),
    ).toHaveClass('fixed')
    expect(
      screen.getByRole('link', { name: messages.Navigation.cheques }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('button', { name: messages.SharedUI.search }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: messages.SharedUI.more }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: messages.SharedUI.calculator }),
    ).not.toBeInTheDocument()
  })
  it('uses a keyboard-accessible More popover without Features payment-history shortcuts', async () => {
    const user = userEvent.setup()
    pathname = '/features'
    shell()
    const trigger = screen.getByRole('button', { name: messages.SharedUI.more })
    await user.click(trigger)
    expect(
      screen.getByRole('button', { name: messages.SharedUI.calculator }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: messages.Navigation.settings }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: messages.Settings.transactions }),
    ).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it('excludes create workflows and hides shell actions for an open keyboard', () => {
    pathname = '/cheques/create'
    const view = shell()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    pathname = '/cheques'
    keyboard = true
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppFab />
        <BottomNav />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByTestId('app-fab-create')).not.toBeInTheDocument()
  })
  it('gives tags list a create action above the newly-visible navigation', () => {
    pathname = '/tags'
    shell()
    expect(screen.getByTestId('app-fab-create')).toHaveAttribute(
      'href',
      '/tags/create',
    )
    expect(screen.getByTestId('app-fab-create')).toHaveClass(
      'bottom-[calc(5rem+env(safe-area-inset-bottom))]',
    )
  })
})
