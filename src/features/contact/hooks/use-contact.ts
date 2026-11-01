'use client'

import { useState } from 'react'
import {
  ContactSubmissionError,
  sendContactMessage,
} from '@/features/contact/repositories/contact.repository'
import type { ContactMessage } from '@/validators/contact'

type ContactState = 'idle' | 'sending' | 'success' | 'failure' | 'rate_limited'

export function useContact() {
  const [state, setState] = useState<ContactState>('idle')

  async function submit(message: ContactMessage) {
    setState('sending')
    try {
      await sendContactMessage(message)
      setState('success')
      return true
    } catch (error) {
      setState(
        error instanceof ContactSubmissionError && error.code === 'rate_limited'
          ? 'rate_limited'
          : 'failure',
      )
      return false
    }
  }

  function reset() {
    setState('idle')
  }

  return { state, submit, reset }
}
