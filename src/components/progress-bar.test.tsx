import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressBar } from './progress-bar'

const state = vi.hoisted(() => ({
  pathname: '/cheques',
  params: new URLSearchParams(),
  configure: vi.fn(),
  start: vi.fn(),
  done: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => state.params,
}))
vi.mock('nprogress', () => ({ default: state }))
beforeEach(() => {
  vi.clearAllMocks()
  state.pathname = '/cheques'
  state.params = new URLSearchParams()
})
afterEach(() => {
  cleanup()
  document.getElementById('progress-bar-nav-container')?.remove()
})
function clickLink(href: string, attributes: Record<string, string> = {}) {
  const link = document.createElement('a')
  link.href = href
  for (const [name, value] of Object.entries(attributes))
    link.setAttribute(name, value)
  link.addEventListener('click', (event) => event.preventDefault())
  document.body.append(link)
  fireEvent.click(link)
  link.remove()
}

describe('ProgressBar', () => {
  it('configures its default container and ends progress after route changes', () => {
    const { rerender } = render(<ProgressBar />)
    expect(state.configure).toHaveBeenCalledWith({
      showSpinner: false,
      speed: 400,
      minimum: 0.2,
      parent: '#progress-bar-container',
    })
    expect(state.done).toHaveBeenCalledOnce()
    state.pathname = '/parties'
    rerender(<ProgressBar />)
    expect(state.done).toHaveBeenCalledTimes(2)
    state.params = new URLSearchParams('sort=name')
    rerender(<ProgressBar />)
    expect(state.done).toHaveBeenCalledTimes(3)
  })

  it('prefers the top-navigation progress container when available', () => {
    const container = document.createElement('div')
    container.id = 'progress-bar-nav-container'
    document.body.append(container)
    render(<ProgressBar />)
    expect(state.configure).toHaveBeenCalledWith({
      parent: '#progress-bar-nav-container',
    })
  })

  it('starts only for internal navigation rather than downloads or new tabs', () => {
    render(<ProgressBar />)
    clickLink('/parties')
    expect(state.start).toHaveBeenCalledOnce()
    clickLink(window.location.href)
    clickLink('https://external.example/page')
    clickLink('/report.csv', { download: '' })
    clickLink('/accounts', { target: '_blank' })
    fireEvent.click(document.body)
    expect(state.start).toHaveBeenCalledOnce()
  })

  it('removes its click listener on unmount', () => {
    const { unmount } = render(<ProgressBar />)
    unmount()
    clickLink('/parties')
    expect(state.start).not.toHaveBeenCalled()
  })
})
