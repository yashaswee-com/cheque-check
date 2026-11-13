import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Invoice01Icon } from '@hugeicons/core-free-icons'
import { UsageMeter } from './usage-meter'

describe('UsageMeter', () => {
  it('shows usage and an accessible progress bar', () => {
    render(
      <UsageMeter
        label="Active cheques"
        used={2}
        limit={10}
        usedText="2 / 10 used"
        icon={Invoice01Icon}
      />,
    )

    expect(screen.getByText('2 / 10 used')).toBeVisible()
    expect(
      screen.getByRole('progressbar', { name: 'Active cheques' }),
    ).toHaveAttribute('aria-valuenow', '20')
  })
})
