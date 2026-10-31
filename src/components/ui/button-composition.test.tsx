import type { ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Button } from './button'

// A custom rendered element may still dispatch clicks when aria-disabled.
vi.mock('@base-ui/react/button', () => ({
  Button: ({
    disabled,
    nativeButton: _native,
    render: _render,
    ...props
  }: ComponentProps<'div'> & {
    disabled?: boolean
    nativeButton?: boolean
    render?: unknown
  }) => <div role="button" aria-disabled={disabled} {...props} />,
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
