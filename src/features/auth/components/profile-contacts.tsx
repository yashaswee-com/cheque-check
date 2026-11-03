'use client'

import { useEmailLink } from '../hooks/use-email-link'
import { EmailLinkSection } from './email-link-section'
import { LoginPhoneSection } from './login-phone-section'

/**
 * Shows the sign-in contact first (read-only, verified) and the other
 * contact second with its existing verification flow.
 */
export function ProfileContacts() {
  const { data } = useEmailLink()
  const phoneFirst = data?.loginMethod === 'phone'
  return (
    <div
      className="space-y-6"
      data-testid="profile-contacts"
      data-login-method={phoneFirst ? 'phone' : 'email'}
    >
      {phoneFirst ? (
        <>
          <LoginPhoneSection primary />
          <EmailLinkSection />
        </>
      ) : (
        <>
          <EmailLinkSection primary />
          <LoginPhoneSection />
        </>
      )}
    </div>
  )
}
