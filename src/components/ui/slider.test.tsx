import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Slider } from './slider'

afterEach(cleanup)

it('renders one labelled thumb per value and reports committed ranges', () => {
  const onValueCommitted = vi.fn()
  render(
    <Slider
      min={0}
      max={10}
      defaultValue={[2, 8]}
      thumbLabels={['Low', 'High']}
      onValueCommitted={onValueCommitted}
    />,
  )
  const thumbs = screen.getAllByRole('slider', { hidden: true })
  expect(thumbs.map((thumb) => thumb.getAttribute('aria-label'))).toEqual([
    'Low',
    'High',
  ])
  fireEvent.keyDown(thumbs[1], { key: 'ArrowLeft' })
  expect(onValueCommitted).toHaveBeenLastCalledWith([2, 7], expect.anything())
})

it('defaults to a single thumb at the minimum', () => {
  render(<Slider min={5} max={10} />)
  const [thumb] = screen.getAllByRole('slider', { hidden: true })
  expect(thumb).toHaveAttribute('aria-valuenow', '5')
})
