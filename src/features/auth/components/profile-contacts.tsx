'use client'

import { useEmailLink } from '../hooks/use-email-link'
import { EmailLinkSection } from './email-link-section'
import { LoginPhoneSection } from './login-phone-section'

export function ProfileContacts() {
  const { data } = useEmailLink()
  const phoneFirst = data?.loginMethod === 'phone'
  return (
    <div
      className="space-y-4"
      data-testid="profile-contacts"
      data-login-method={phoneFirst ? 'phone' : 'email'}
    >
      <EmailLinkSection primary={!phoneFirst} />
      <LoginPhoneSection primary={phoneFirst} />
    </div>
  )
}
