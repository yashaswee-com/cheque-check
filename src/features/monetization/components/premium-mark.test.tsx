import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../../messages/en.json'
import { PremiumMark } from './premium-mark'
const state = vi.hoisted(() => ({ owned: false }))
vi.mock('../hooks/use-premium-access', () => ({
  usePremiumAccess: () => ({ hasLifetimePurchase: state.owned }),
}))
afterEach(cleanup)
describe('Lifetime crown', () => {
  it.each([false, true])(
    'uses muted styling only for a paid Lifetime owner: %s',
    (owned) => {
      state.owned = owned
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <PremiumMark />
        </NextIntlClientProvider>,
      )
      const mark = screen.getByTitle(messages.Premium.marker)
      expect(mark).toHaveAttribute('data-owned', String(owned))
      expect(mark.classList.contains('premium-crown-shine')).toBe(!owned)
      expect(mark).toHaveAttribute('aria-hidden', 'true')
    },
  )
  it('renders a compact solid crown rather than an outline', () => {
    state.owned = false
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumMark />
      </NextIntlClientProvider>,
    )
    const mark = screen.getByTitle(messages.Premium.marker)
    const crown = mark.querySelector('[data-slot="premium-crown"]')!
    expect(crown).toHaveAttribute('fill', 'currentColor')
    expect(crown).toHaveClass('size-2.5')
    expect(mark).toHaveClass('p-0.5')
  })
})
