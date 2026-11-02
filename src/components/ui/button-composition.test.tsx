import type { ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Button } from './button'

const callback = vi.hoisted(() => {
  const state: { result?: unknown } = {}
  return state
})

// A custom rendered element may still dispatch clicks when aria-disabled.
vi.mock('@base-ui/react/button', () => ({
  Button: ({
    disabled,
    nativeButton: _native,
    render: _render,
    onClick,
    ...props
  }: Omit<ComponentProps<'div'>, 'onClick'> & {
    disabled?: boolean
    nativeButton?: boolean
    render?: unknown
    onClick?: (event: React.MouseEvent<HTMLDivElement>) => unknown
  }) => (
    <div
      role="button"
      aria-disabled={disabled}
      {...props}
      onClick={(event) => {
        callback.result = onClick?.(event)
      }}
    />
  ),
}))
afterEach(cleanup)
it('prevents activation from custom rendered elements during loading', () => {
  const click = vi.fn()
  const { rerender } = render(
    <Button loading onClick={click}>
      Submit
    </Button>,
  )
  expect(fireEvent.click(screen.getByRole('button'))).toBe(false)
  expect(click).not.toHaveBeenCalled()
  rerender(
    <Button loading={false} onClick={click}>
      Submit
    </Button>,
  )
  fireEvent.click(screen.getByRole('button'))
  expect(click).toHaveBeenCalledOnce()
})

it('does not shimmer or activate disabled custom elements', () => {
  const click = vi.fn()
  render(
    <Button disabled onClick={click}>
      Download
    </Button>,
  )
  expect(fireEvent.click(screen.getByRole('button'))).toBe(false)
  expect(click).not.toHaveBeenCalled()
  expect(document.querySelector('[data-slot="button-shimmer"]')).toBeNull()
})

it('releases the pending state without swallowing action failures', async () => {
  const task = Promise.withResolvers<void>()
  const click = vi.fn(() => task.promise)
  render(<Button onClick={click}>Download</Button>)
  const button = screen.getByRole('button', { name: 'Download' })
  fireEvent.click(button)
  const result = callback.result
  expect(button).toHaveAttribute('aria-busy', 'true')
  await act(async () => {
    task.reject(new Error('Download failed'))
    await expect(result).rejects.toThrow('Download failed')
  })
  expect(button).not.toHaveAttribute('aria-busy')
  expect(button).toHaveAttribute('aria-disabled', 'false')
})

it('blocks rapid custom-element activation before React commits pending state', async () => {
  const task = Promise.withResolvers<void>()
  const click = vi.fn(() => task.promise)
  render(<Button onClick={click}>Download</Button>)
  const button = screen.getByRole('button', { name: 'Download' })
  act(() => {
    fireEvent.click(button)
    fireEvent.click(button)
  })
  expect(click).toHaveBeenCalledOnce()
  await act(async () => task.resolve())
})
