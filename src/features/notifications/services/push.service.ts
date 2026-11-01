import { pushRepository } from '../repositories/push.repository'
import { isInstalled, isIOS } from '@/lib/pwa-install'

const OWNER_KEY = 'chequecheck-push-owner'
export type PushState =
  | 'unsupported'
  | 'install'
  | 'unconfigured'
  | 'denied'
  | 'enabled'
  | 'available'

export function pushAvailability(): PushState | null {
  if (typeof window === 'undefined' || !window.isSecureContext)
    return 'unsupported'
  if (isIOS() && !isInstalled()) return 'install'
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  )
    return 'unsupported'
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  return null
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', {
    scope: '/',
    updateViaCache: 'none',
  })
}
async function existing() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator))
    return null
  const worker = await navigator.serviceWorker.getRegistration('/')
  return worker ? worker.pushManager.getSubscription() : null
}

export const pushService = {
  async state(): Promise<PushState> {
    const unavailable = pushAvailability()
    if (unavailable) return unavailable
    const sub = await existing()
    return sub && (await pushRepository.owns(sub.endpoint))
      ? 'enabled'
      : 'available'
  },
  async enable(userId: string) {
    const unavailable = pushAvailability()
    if (unavailable) throw new Error(`Push is ${unavailable}`)
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
    if (!/^B[A-Za-z0-9_-]{86}$/.test(publicKey))
      throw new Error('Invalid public VAPID configuration')
    // Persist ownership before requesting permission so unavailable storage fails visibly.
    const previousOwner = localStorage.getItem(OWNER_KEY)
    let sub = await existing()
    if (
      sub &&
      (previousOwner !== userId || !(await pushRepository.owns(sub.endpoint)))
    ) {
      if (!(await sub.unsubscribe()))
        throw new Error('Could not detach previous browser subscription')
      sub = null
    }
    localStorage.setItem(OWNER_KEY, userId)
    if ((await Notification.requestPermission()) !== 'granted')
      throw new Error('Notification permission was not granted')
    const worker = await registration()
    // Registration can be installing on a fresh browser; ready waits for activation.
    const ready = worker.active ? worker : await navigator.serviceWorker.ready
    const key = Uint8Array.from(
      atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    )
    sub ??= await ready.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    })
    try {
      await pushRepository.register(sub.toJSON())
    } catch (error) {
      if (!(await sub.unsubscribe()))
        throw new Error('Push registration failed and browser cleanup failed', {
          cause: error,
        })
      throw error
    }
  },
  async disable() {
    const sub = await existing()
    if (sub) {
      // Remove the durable association before sign-out. Failure must block sign-out.
      await pushRepository.remove(sub.endpoint)
      if (!(await sub.unsubscribe()))
        throw new Error('Could not unsubscribe this browser')
    }
    if (typeof window !== 'undefined') localStorage.removeItem(OWNER_KEY)
  },
  async reconcile(userId: string | null) {
    const sub = await existing()
    if (!sub) return
    const owner = localStorage.getItem(OWNER_KEY)
    if (
      !userId ||
      owner !== userId ||
      !(await pushRepository.owns(sub.endpoint))
    ) {
      if (!(await sub.unsubscribe()))
        throw new Error('Could not detach old account push subscription')
      localStorage.removeItem(OWNER_KEY)
    }
  },
}
