import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingSwitchRow } from './setting-switch-row'

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
      'font-semibold',
    )
    expect(screen.getByText('Fewer animations')).toHaveClass(
      'text-xs',
      'text-muted-foreground',
    )
    fireEvent.click(toggle)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
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
