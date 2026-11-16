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
describe('Lifetime diamond', () => {
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
  it('renders a compact decorative diamond', () => {
    state.owned = false
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumMark />
      </NextIntlClientProvider>,
    )
    const mark = screen.getByTitle(messages.Premium.marker)
    const diamond = mark.querySelector('[data-slot="premium-diamond"]')!
    expect(diamond.tagName.toLowerCase()).toBe('svg')
    expect(diamond).toHaveAttribute('aria-hidden', 'true')
    expect(diamond).toHaveClass('size-2.5')
    expect(mark).toHaveClass('p-0.5')
  })
})
