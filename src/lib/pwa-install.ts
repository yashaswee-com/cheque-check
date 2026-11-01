export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pendingPrompt: InstallPromptEvent | null = null
export const INSTALL_EVENT = 'chequecheck-install-change'
export const INSTALL_DISMISSED_KEY = 'chequecheck-install-dismissed-until'

export function getInstallPrompt() {
  return pendingPrompt
}

export function captureInstallPrompt(event: Event) {
  if (!('prompt' in event) || typeof event.prompt !== 'function') return
  event.preventDefault()
  pendingPrompt = event as InstallPromptEvent
  window.dispatchEvent(new Event(INSTALL_EVENT))
}

export function clearInstallPrompt() {
  pendingPrompt = null
  window.dispatchEvent(new Event(INSTALL_EVENT))
}

export function isInstalled() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  )
}

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}
