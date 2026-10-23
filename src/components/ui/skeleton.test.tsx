import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Skeleton } from './skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('uses simultaneous pulse with reduced-motion support and leaves no exit nodes', () => {
    const { container, unmount } = render(
      <>
        <Skeleton />
        <Skeleton />
      </>,
    )
    for (const skeleton of container.querySelectorAll(
      '[data-slot="skeleton"]',
    )) {
      expect(skeleton).toHaveClass(
        'animate-pulse',
        'motion-reduce:animate-none',
      )
      expect(skeleton).not.toHaveAttribute('style')
    }
    unmount()
    expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
  })
})
