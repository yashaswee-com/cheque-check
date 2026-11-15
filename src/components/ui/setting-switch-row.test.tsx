import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingSwitchRow } from './setting-switch-row'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(cleanup)

describe('SettingSwitchRow', () => {
  it('labels and describes the switch with consistent typography', () => {
    const onCheckedChange = vi.fn()
    render(
      <SettingSwitchRow
        id="reduce-motion"
        label="Reduce Motion"
        description="Fewer animations"
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    )
    const toggle = screen.getByRole('switch', { name: 'Reduce Motion' })
    expect(toggle).toHaveAccessibleDescription('Fewer animations')
    expect(screen.getByText('Reduce Motion')).toHaveClass(
      'text-sm',
      'font-normal',
    )
    expect(screen.getByText('Fewer animations')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    )
    fireEvent.click(toggle)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('shows the visible On/Off state and the consequence of the current state', () => {
    const consequence = { on: 'Motion will be reduced', off: 'Full motion' }
    const { rerender } = render(
      <SettingSwitchRow
        id="reduce-motion"
        label="Reduce Motion"
        description="Fewer animations"
        consequence={consequence}
        checked={false}
      />,
    )
    const toggle = screen.getByRole('switch', { name: 'Reduce Motion' })
    expect(screen.getByText('switchOff')).toHaveAttribute('aria-hidden', 'true')
    expect(toggle).toHaveAccessibleDescription('Fewer animations Full motion')
    rerender(
      <SettingSwitchRow
        id="reduce-motion"
        label="Reduce Motion"
        description="Fewer animations"
        consequence={consequence}
        checked
      />,
    )
    expect(screen.getByText('switchOn')).toBeInTheDocument()
    expect(screen.getByText('Motion will be reduced')).toHaveAttribute(
      'aria-live',
      'polite',
    )
  })

  it('renders optional info and extra content', () => {
    render(
      <SettingSwitchRow
        id="privacy"
        label="Hide app"
        info={<button type="button">info</button>}
      >
        <p role="alert">failed</p>
      </SettingSwitchRow>,
    )
    expect(screen.getByRole('switch')).not.toHaveAttribute('aria-describedby')
    expect(screen.getByRole('button', { name: 'info' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('failed')
  })
})
