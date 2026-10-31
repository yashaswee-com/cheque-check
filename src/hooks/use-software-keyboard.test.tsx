import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSoftwareKeyboard } from './use-software-keyboard'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})
describe('useSoftwareKeyboard', () => {
  it('remains closed if VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', null)
    const { result } = renderHook(() => useSoftwareKeyboard())
    expect(result.current).toBe(false)
  })
  it('opens for focused editable inputs, excludes controls and zooming, and removes listeners', () => {
    const viewport = new EventTarget() as EventTarget & {
      height: number
      scale: number
    }
    viewport.height = 800
    viewport.scale = 1
    vi.stubGlobal('visualViewport', viewport)
    vi.stubGlobal('innerHeight', 800)
    const remove = vi.spyOn(viewport, 'removeEventListener')
    const { result, unmount } = renderHook(() => useSoftwareKeyboard())
    const input = document.createElement('input')
    document.body.append(input)
    act(() => {
      input.focus()
      viewport.height = 400
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)
    act(() => {
      viewport.scale = 2
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(false)
    act(() => {
      viewport.scale = 1
      input.type = 'checkbox'
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(false)
    const textarea = document.createElement('textarea')
    document.body.append(textarea)
    act(() => {
      textarea.focus()
      viewport.height = 300
      viewport.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)
    act(() => {
      textarea.blur()
      viewport.height = 800
      viewport.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event('orientationchange'))
    })
    expect(result.current).toBe(false)
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
