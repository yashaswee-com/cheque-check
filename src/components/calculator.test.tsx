import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Calculator } from './calculator'

afterEach(() => {
  cleanup()
})

describe('Calculator', () => {
  it('persists an unchanged position when a primary pointer is released without movement', () => {
    localStorage.clear()
    render(<Calculator onClose={vi.fn()} />)
    const header = screen.getByText('Calculator').parentElement!
    fireEvent.pointerDown(header, {
      pointerId: 1,
      button: 0,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerUp(header, { pointerId: 1 })
    expect(JSON.parse(localStorage.getItem('calculator-position')!)).toEqual({
      x: 16,
      y: 72,
    })
  })
  it('applies animation frames, clamps resize and ignores unrelated pointers', () => {
    localStorage.clear()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    try {
      const { unmount } = render(<Calculator onClose={vi.fn()} />)
      const panel = screen.getByRole('dialog')
      const header = screen.getByText('Calculator').parentElement!
      fireEvent.pointerDown(header, { pointerId: 1, button: 1 })
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 90, clientY: 90 })
      expect(frames).toHaveLength(0)
      fireEvent.pointerDown(header, {
        pointerId: 1,
        button: 0,
        clientX: 0,
        clientY: 0,
      })
      fireEvent.pointerMove(header, { pointerId: 2, clientX: 90, clientY: 90 })
      expect(frames).toHaveLength(0)
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 20, clientY: 20 })
      act(() => frames[0](0))
      expect(panel.style.transform).toBe('translate3d(36px, 92px, 0)')
      fireEvent(window, new Event('resize'))
      expect(panel.style.transform).toBe('translate3d(36px, 92px, 0)')
      fireEvent.pointerUp(header, { pointerId: 2 })
      fireEvent.pointerUp(header, { pointerId: 1 })
      unmount()
      expect(window.cancelAnimationFrame).toHaveBeenCalled()
      const previousPosition = panel.style.transform
      act(() => frames[0](0))
      expect(panel.style.transform).toBe(previousPosition)
    } finally {
      vi.restoreAllMocks()
    }
  })
  it.each([
    { keys: ['8', '-', '3', '='], expected: '5' },
    { keys: ['8', 'x', '3', '='], expected: '24' },
    { keys: ['8', '/', '2', '='], expected: '4' },
    { keys: ['8', '/', '0', '='], expected: 'Error' },
    { keys: ['2', '+', '3', '+', '4', '='], expected: '9' },
    { keys: ['.', '2', '.', '5'], expected: '0.25' },
    { keys: ['2', '3', 'DEL'], expected: '2' },
    { keys: ['2', 'DEL'], expected: '0' },
    { keys: ['='], expected: '0' },
    { keys: ['1', '/', '3', '='], expected: '0.3333333333' },
    { keys: ['8', '/', '0', '=', '7'], expected: '7' },
    { keys: ['8', '/', '0', '=', '+'], expected: 'Error' },
    { keys: ['1', '+', '.', '2', '='], expected: '1.2' },
    { keys: ['1', '+', 'DEL', '2', '='], expected: '3' },
    { keys: ['8', '/', '0', '=', '.'], expected: '0.' },
  ])('handles arithmetic and input sequence $keys', ({ keys, expected }) => {
    render(<Calculator onClose={vi.fn()} />)
    for (const key of keys)
      fireEvent.click(screen.getByRole('button', { name: key }))
    expect(
      within(screen.getByRole('dialog')).getByText(expected, {
        selector: 'span',
      }),
    ).toBeInTheDocument()
  })

  it('does not propagate close-button pointer presses to the drag header', () => {
    render(<Calculator onClose={vi.fn()} />)
    const close = screen.getByRole('button', { name: 'Close calculator' })
    fireEvent.pointerDown(close, {
      pointerId: 9,
      button: 0,
      clientX: 1,
      clientY: 1,
    })
    const header = screen.getByText('Calculator').parentElement!
    fireEvent.pointerMove(header, { pointerId: 9, clientX: 100, clientY: 100 })
    fireEvent.pointerUp(header, { pointerId: 9 })
    expect(screen.getByRole('dialog').style.transform).not.toBe(
      'translate3d(115px, 171px, 0)',
    )
  })
  it('calculates a basic addition', () => {
    render(<Calculator onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '7' }))
    fireEvent.click(screen.getByRole('button', { name: '+' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '=' }))

    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('resets and closes from the floating panel', () => {
    const onClose = vi.fn()
    render(<Calculator onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '9' }))
    fireEvent.click(screen.getByRole('button', { name: 'RESET' }))
    expect(
      within(screen.getByRole('dialog')).getByText('0', { selector: 'span' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close calculator' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('drags by the header and remembers the position', () => {
    localStorage.clear()
    render(<Calculator onClose={vi.fn()} />)
    const header = screen.getByText('Calculator').parentElement!

    fireEvent.pointerDown(header, {
      pointerId: 1,
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(header, { pointerId: 1, clientX: 140, clientY: 130 })
    fireEvent.pointerUp(header, { pointerId: 1, clientX: 140, clientY: 130 })

    expect(JSON.parse(localStorage.getItem('calculator-position')!)).toEqual({
      x: 56,
      y: 102,
    })
    expect(screen.getByRole('dialog').style.transform).toBe(
      'translate3d(56px, 102px, 0)',
    )
  })
})
