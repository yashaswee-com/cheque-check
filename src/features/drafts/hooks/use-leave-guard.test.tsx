import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLeaveGuard } from './use-leave-guard'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

function clickLink(href: string, options: MouseEventInit = {}) {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.addEventListener('click', (event) => event.preventDefault())
  document.body.append(anchor)
  act(() => {
    anchor.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, ...options }),
    )
  })
  anchor.remove()
}

beforeEach(() => {
  vi.spyOn(window.history, 'pushState').mockImplementation(() => {})
  vi.spyOn(window.history, 'go').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('useLeaveGuard', () => {
  it('intercepts a local navigation and only pushes after confirmation', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    clickLink('/parties?sort=name#selected')

    expect(result.current.isLeavePending).toBe(true)
    expect(router.push).not.toHaveBeenCalled()
    act(() => result.current.confirmLeave())
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      '/parties?sort=name#selected',
    )
    expect(result.current.isLeavePending).toBe(false)

    clickLink('/accounts')
    expect(result.current.isLeavePending).toBe(false)
  })

  it('cancels navigation without disabling subsequent protection', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    clickLink('/parties')
    act(() => result.current.cancelLeave())
    expect(result.current.isLeavePending).toBe(false)
    expect(router.push).not.toHaveBeenCalled()

    clickLink('/accounts')
    expect(result.current.isLeavePending).toBe(true)
    act(() => result.current.confirmLeave())
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/accounts')
  })

  it('confirming without pending navigation does not bypass the guard', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    act(() => result.current.confirmLeave())
    clickLink('/parties')
    expect(result.current.isLeavePending).toBe(true)
  })

  it.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { button: 1 },
    { button: 2 },
  ])('ignores modified or non-primary clicks: %j', (options) => {
    const { result } = renderHook(() => useLeaveGuard(true))
    clickLink('/parties', options)
    expect(result.current.isLeavePending).toBe(false)
    expect(router.push).not.toHaveBeenCalled()
  })

  it.each(['https://example.com/elsewhere', window.location.href + '#section'])(
    'ignores external and same-page links: %s',
    (href) => {
      const { result } = renderHook(() => useLeaveGuard(true))
      clickLink(href)
      expect(result.current.isLeavePending).toBe(false)
    },
  )

  it.each(['target', 'download'])('ignores links with %s', (attribute) => {
    const { result } = renderHook(() => useLeaveGuard(true))
    const anchor = document.createElement('a')
    anchor.href = '/parties'
    anchor.setAttribute(attribute, attribute === 'target' ? '_blank' : '')
    anchor.addEventListener('click', (event) => event.preventDefault())
    document.body.append(anchor)
    act(() => {
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    })
    anchor.remove()
    expect(result.current.isLeavePending).toBe(false)
  })

  it('ignores clicks already prevented and clicks outside links', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    event.preventDefault()
    act(() => document.dispatchEvent(event))
    act(() => document.dispatchEvent(new MouseEvent('click')))
    expect(result.current.isLeavePending).toBe(false)
  })

  it('blocks tab close until an explicitly bypassed navigation', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    const first = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(first)
    expect(first.defaultPrevented).toBe(true)

    const navigate = vi.fn()
    act(() => result.current.bypass(navigate))
    expect(navigate).toHaveBeenCalledOnce()
    const second = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(second)
    expect(second.defaultPrevented).toBe(false)
  })

  it('restores a history sentinel and confirms back across both entries', () => {
    const { result } = renderHook(() => useLeaveGuard(true))
    expect(window.history.pushState).toHaveBeenCalledOnce()
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(window.history.pushState).toHaveBeenCalledTimes(2)
    expect(result.current.isLeavePending).toBe(true)
    expect(window.history.go).not.toHaveBeenCalled()

    act(() => result.current.confirmLeave())
    expect(window.history.go).toHaveBeenCalledExactlyOnceWith(-2)
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(result.current.isLeavePending).toBe(false)
    expect(window.history.pushState).toHaveBeenCalledTimes(2)
  })

  it('does not add another sentinel when re-enabled', () => {
    const { rerender } = renderHook((enabled) => useLeaveGuard(enabled), {
      initialProps: true,
    })
    rerender(false)
    rerender(true)
    expect(window.history.pushState).toHaveBeenCalledOnce()
  })

  it.each([true, false])(
    'explicit goBack skips the sentinel only when present (%s)',
    (enabled) => {
      const { result } = renderHook(() => useLeaveGuard(enabled))
      act(() => result.current.goBack())
      expect(window.history.go).toHaveBeenCalledExactlyOnceWith(
        enabled ? -2 : -1,
      )
      act(() => window.dispatchEvent(new PopStateEvent('popstate')))
      expect(result.current.isLeavePending).toBe(false)
    },
  )

  it('does not intercept navigation or tab close while disabled', () => {
    const { result } = renderHook(() => useLeaveGuard(false))
    clickLink('/parties')
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(result.current.isLeavePending).toBe(false)
    expect(window.history.pushState).not.toHaveBeenCalled()
  })

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useLeaveGuard(true))
    unmount()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    window.dispatchEvent(new PopStateEvent('popstate'))
    clickLink('/parties')
    expect(event.defaultPrevented).toBe(false)
    expect(window.history.pushState).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })
})
