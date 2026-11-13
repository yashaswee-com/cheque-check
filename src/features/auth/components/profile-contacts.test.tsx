import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileContacts } from './profile-contacts'
import { loginMethodOf } from '../repositories/email-link.repository'

const state = vi.hoisted(() => ({
  data: undefined as { loginMethod: 'email' | 'phone' } | undefined,
}))
vi.mock('../hooks/use-email-link', () => ({
  useEmailLink: () => ({ data: state.data }),
}))
vi.mock('./email-link-section', () => ({
  EmailLinkSection: ({ primary }: { primary?: boolean }) => (
    <div data-testid="email-section" data-primary={String(!!primary)} />
  ),
}))
vi.mock('./login-phone-section', () => ({
  LoginPhoneSection: ({ primary }: { primary?: boolean }) => (
    <div data-testid="phone-section" data-primary={String(!!primary)} />
  ),
}))

beforeEach(() => {
  state.data = undefined
})
afterEach(cleanup)

function order() {
  return Array.from(
    screen.getByTestId('profile-contacts').querySelectorAll('[data-primary]'),
  ).map((node) => [
    node.getAttribute('data-testid'),
    node.getAttribute('data-primary'),
  ])
}

describe('ProfileContacts', () => {
  it('leads with the read-only email for email and Google sign-ins', () => {
    state.data = { loginMethod: 'email' }
    render(<ProfileContacts />)
    expect(screen.getByTestId('profile-contacts')).toHaveClass('rounded-lg')
    expect(order()).toEqual([
      ['email-section', 'true'],
      ['phone-section', 'false'],
    ])
  })

  it('leads with the read-only phone for phone OTP sign-ins', () => {
    state.data = { loginMethod: 'phone' }
    render(<ProfileContacts />)
    expect(screen.getByTestId('profile-contacts')).toHaveAttribute(
      'data-login-method',
      'phone',
    )
    expect(order()).toEqual([
      ['phone-section', 'true'],
      ['email-section', 'false'],
    ])
  })

  it('defaults to email first while the identity is loading', () => {
    render(<ProfileContacts />)
    expect(order()[0]).toEqual(['email-section', 'true'])
  })
})

describe('loginMethodOf', () => {
  it('maps only the phone provider to phone', () => {
    expect(loginMethodOf('phone')).toBe('phone')
    expect(loginMethodOf('google')).toBe('email')
    expect(loginMethodOf('email')).toBe('email')
    expect(loginMethodOf(undefined)).toBe('email')
  })
})
