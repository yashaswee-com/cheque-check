import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PremiumModal } from './premium-modal'
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('closes and navigates to plans without applying the dismissal redirect', () => {
  const change = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PremiumModal
        open
        onOpenChange={change}
        onCloseRedirect="/"
        featureName="Exports"
      />
    </NextIntlClientProvider>,
  )
  expect(screen.getByRole('dialog')).toHaveTextContent('Exports')
  fireEvent.click(
    screen.getByRole('button', { name: messages.Common.viewPremiumPlans }),
  )
  expect(change).toHaveBeenCalledWith(false)
  expect(push).toHaveBeenCalledExactlyOnceWith('/features')
})
it('applies the optional redirect when declining premium', () => {
  const change = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PremiumModal open onOpenChange={change} onCloseRedirect="/cheques" />
    </NextIntlClientProvider>,
  )
  fireEvent.click(
    screen.getByRole('button', { name: messages.Common.maybeLater }),
  )
  expect(change).toHaveBeenCalledWith(false)
  expect(push).toHaveBeenCalledWith('/cheques')
})
