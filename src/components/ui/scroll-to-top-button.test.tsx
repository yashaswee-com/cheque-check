import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { ScrollToTopButton } from './scroll-to-top-button'

const preferences = vi.hoisted(() => ({ reduced: false, keyboard: false }))
vi.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotionPreference: () => preferences.reduced,
}))
vi.mock('@/hooks/use-software-keyboard', () => ({
  useSoftwareKeyboard: () => preferences.keyboard,
}))

function mount(inPageScroller = true) {
  const component = <ScrollToTopButton />
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {inPageScroller ? <main data-page-scroll>{component}</main> : component}
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  preferences.reduced = false
  preferences.keyboard = false
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ScrollToTopButton', () => {
  it('appears only when scrolling up away from the top and hides on downward scroll', () => {
    const { container } = mount()
    const scroller = container.querySelector('main')!
    const button = screen.getByLabelText('Scroll to top')
    expect(button).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveAttribute('tabindex', '-1')

    scroller.scrollTop = 500
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'true')
    scroller.scrollTop = 400
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'false')
    expect(button).toHaveAttribute('tabindex', '0')
    scroller.scrollTop = 450
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'true')
    scroller.scrollTop = 150
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'true')
  })

  it('scrolls the page smoothly and does not reappear during the programmatic scroll', () => {
    const { container } = mount()
    const scroller = container.querySelector('main')!
    scroller.scrollTo = vi.fn()
    scroller.scrollTop = 500
    fireEvent.scroll(scroller)
    scroller.scrollTop = 400
    fireEvent.scroll(scroller)
    const button = screen.getByRole('button', { name: 'Scroll to top' })
    fireEvent.click(button)
    expect(scroller.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    })
    expect(button.querySelector('svg')).toHaveClass('animate-bounce')
    scroller.scrollTop = 300
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'true')
    fireEvent.wheel(scroller)
    scroller.scrollTop = 250
    fireEvent.scroll(scroller)
    expect(button).toHaveAttribute('aria-hidden', 'false')
    expect(button.querySelector('svg')).not.toHaveClass('animate-bounce')
  })

  it('uses instant scrolling for reduced motion and falls back to the window', () => {
    preferences.reduced = true
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
    mount(false)
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 400 })
    fireEvent.scroll(window)
    fireEvent.click(screen.getByRole('button', { name: 'Scroll to top' }))
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'instant',
    })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
  })

  it('hides while the software keyboard is open', () => {
    preferences.keyboard = true
    const { container } = mount()
    const scroller = container.querySelector('main')!
    scroller.scrollTop = 500
    fireEvent.scroll(scroller)
    scroller.scrollTop = 400
    fireEvent.scroll(scroller)
    expect(screen.getByLabelText('Scroll to top')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
