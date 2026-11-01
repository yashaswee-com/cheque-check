import { StrictMode } from 'react'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreationSuccessScreen } from './creation-success-screen'
const celebrate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/celebrate', () => ({ celebrate }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
describe('success-screen celebration timing', () => {
  it('fires once on mount, draws a white tick and never fires on Continue or rerender', () => {
    const next = vi.fn(),
      element = (
        <StrictMode>
          <CreationSuccessScreen
            title="Saved"
            description="Done"
            ctaLabel="Continue"
            onContinue={next}
          />
        </StrictMode>
      )
    const { rerender } = render(element)
    expect(celebrate).toHaveBeenCalledOnce()
    expect(screen.getByTestId('success-tick')).toHaveAttribute(
      'stroke',
      'white',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(next).toHaveBeenCalledOnce()
    expect(celebrate).toHaveBeenCalledOnce()
    rerender(element)
    expect(celebrate).toHaveBeenCalledOnce()
  })
})
