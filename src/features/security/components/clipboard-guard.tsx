'use client'

import { useEffect } from 'react'

export const CLIPBOARD_GUARD_ATTRIBUTE = 'data-clipboard-guard'

function isEditable(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const field = target.closest('input, textarea, [contenteditable]')
  if (!field) return false
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)
    return !field.readOnly && !field.disabled
  return field.getAttribute('contenteditable') !== 'false'
}

/**
 * Financial data must not leave the app through the clipboard. Copy and cut
 * are always blocked; paste only reaches editable fields so OTPs, amounts and
 * names can still be pasted into forms.
 */
export function ClipboardGuard() {
  useEffect(() => {
    const block = (event: ClipboardEvent) => {
      event.preventDefault()
      event.clipboardData?.clearData()
    }
    const paste = (event: ClipboardEvent) => {
      if (!isEditable(event.target)) event.preventDefault()
    }
    document.addEventListener('copy', block, true)
    document.addEventListener('cut', block, true)
    document.addEventListener('paste', paste, true)
    document.documentElement.setAttribute(CLIPBOARD_GUARD_ATTRIBUTE, '')
    return () => {
      document.removeEventListener('copy', block, true)
      document.removeEventListener('cut', block, true)
      document.removeEventListener('paste', paste, true)
      document.documentElement.removeAttribute(CLIPBOARD_GUARD_ATTRIBUTE)
    }
  }, [])
  return null
}
