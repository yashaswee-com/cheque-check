import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountName } from './account-name'

describe('AccountName', () => {
  it('keeps short names static', () => {
    const { container } = render(<AccountName name="Main account" />)
    const name = container.querySelector('span')

    expect(name).toHaveTextContent('Main account')
    expect(name).toHaveAttribute('title', 'Main account')
    expect(container.querySelector('.account-name-marquee-track')).toBeNull()
  })

  it('loops long names visually while exposing the full name once to assistive technology', () => {
    const fullName = 'Primary operating account for regional payments'
    const { container } = render(<AccountName name={fullName} />)

    expect(container.querySelector('.sr-only')).toHaveTextContent(fullName)
    expect(container.querySelector('.account-name-marquee')).toHaveAttribute(
      'title',
      fullName,
    )
    expect(
      container.querySelector('.account-name-marquee-track'),
    ).toHaveAttribute('aria-hidden', 'true')
    expect(
      container.querySelector('.account-name-marquee-fallback'),
    ).toHaveAttribute('aria-hidden', 'true')
    expect(
      container.querySelectorAll('.account-name-marquee-track > span'),
    ).toHaveLength(2)
    expect(
      container.querySelector('.account-name-marquee-fallback'),
    ).toHaveTextContent(fullName)
  })
})
