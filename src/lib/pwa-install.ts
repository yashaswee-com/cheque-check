export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pendingPrompt: InstallPromptEvent | null = null
export const INSTALL_EVENT = 'chequecheck-install-change'
export const INSTALL_DISMISSED_KEY = 'chequecheck-install-dismissed'
const INSTALL_CONFIRMED_KEY = 'chequecheck-install-confirmed'

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

export function confirmInstall() {
  try {
    sessionStorage.setItem(INSTALL_CONFIRMED_KEY, 'true')
  } catch (error) {
    console.error('Cannot save installation confirmation', error)
  }
  clearInstallPrompt()
}

export function isInstalled() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  if (standalone) return true
  try {
    return sessionStorage.getItem(INSTALL_CONFIRMED_KEY) === 'true'
  } catch (error) {
    console.error('Cannot read installation confirmation', error)
    return false
  }
}

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function getManualInstallInstructions() {
  if (isIOS()) return 'iosInstructions'
  if (/Android/.test(navigator.userAgent)) return 'androidInstructions'
  if (
    /Macintosh|MacIntel/.test(`${navigator.userAgent} ${navigator.platform}`) &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent)
  )
    return 'macSafariInstructions'
  return 'browserInstructions'
}
