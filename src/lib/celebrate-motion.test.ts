import { afterEach, describe, expect, it, vi } from 'vitest'
import { celebrate } from './celebrate'
const confetti = vi.hoisted(() => vi.fn())
vi.mock('canvas-confetti', () => ({ default: confetti }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  document.documentElement.removeAttribute('data-reduce-motion')
})

describe('celebration motion', () => {
  it('does not load browser-only confetti during server rendering', () => {
    vi.stubGlobal('window', undefined)
    celebrate()
    expect(confetti).not.toHaveBeenCalled()
  })
  it('respects both application and browser motion preferences', () => {
    document.documentElement.setAttribute('data-reduce-motion', '')
    celebrate()
    expect(confetti).not.toHaveBeenCalled()
    document.documentElement.removeAttribute('data-reduce-motion')
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    celebrate()
    expect(confetti).not.toHaveBeenCalled()
  })

  it('uses brand colors and bottom-origin confetti when animation is allowed', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    )
    celebrate()
    await vi.waitFor(() =>
      expect(confetti).toHaveBeenCalledWith({
        particleCount: 140,
        spread: 75,
        startVelocity: 60,
        gravity: 1.1,
        ticks: 90,
        origin: { x: 0.5, y: 1 },
        colors: ['#0066cc', '#2997ff', '#34C759', '#FFCC00', '#FF9500'],
        zIndex: 9999,
        disableForReducedMotion: true,
      }),
    )
  })
})
