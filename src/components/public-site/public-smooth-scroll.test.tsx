import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PublicSmoothScroll } from './public-smooth-scroll'

const state = vi.hoisted(() => ({
  reducedMotion: false,
  construct: vi.fn(),
  destroy: vi.fn(),
}))

vi.mock('@/hooks/use-reduced-motion', () => ({
  useReducedMotionPreference: () => state.reducedMotion,
}))

vi.mock('lenis', () => ({
  default: class {
    constructor(options: unknown) {
      state.construct(options)
    }

    destroy() {
      state.destroy()
    }
  },
}))

afterEach(() => {
  cleanup()
  state.reducedMotion = false
  state.construct.mockClear()
  state.destroy.mockClear()
})

it('mounts subtle wheel and touch smoothing and cleans up on unmount', async () => {
  const view = render(<PublicSmoothScroll />)

  expect(state.construct).not.toHaveBeenCalled()
  fireEvent.wheel(window)
  await waitFor(() =>
    expect(state.construct).toHaveBeenCalledWith(
      expect.objectContaining({
        autoRaf: true,
        lerp: 0.16,
        smoothWheel: true,
        syncTouch: true,
        syncTouchLerp: 0.1,
        touchInertiaExponent: 1.4,
        touchMultiplier: 0.95,
        wheelMultiplier: 0.9,
        prevent: expect.any(Function),
      }),
    ),
  )

  view.unmount()
  expect(state.destroy).toHaveBeenCalledTimes(1)
})

it('does not mount smoothing when reduced motion is enabled', () => {
  state.reducedMotion = true
  render(<PublicSmoothScroll />)
  expect(state.construct).not.toHaveBeenCalled()
})

it('leaves controls and nested public scrollers unsmoothed', async () => {
  render(<PublicSmoothScroll />)
  fireEvent.wheel(window)
  await waitFor(() => expect(state.construct).toHaveBeenCalledOnce())
  const options = state.construct.mock.calls[0][0] as {
    prevent: (node: HTMLElement) => boolean
  }

  const input = document.createElement('input')
  const scroller = document.createElement('div')
  scroller.dataset.slot = 'pill-scroller'
  const child = document.createElement('span')
  scroller.append(child)

  expect(options.prevent(input)).toBe(true)
  expect(options.prevent(child)).toBe(true)
  expect(options.prevent(document.createElement('div'))).toBe(false)
})
