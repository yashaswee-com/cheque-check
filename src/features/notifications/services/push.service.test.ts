import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushService } from './push.service'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  owns: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('../repositories/push.repository', () => ({ pushRepository: mocks }))
const permission = vi.fn()
const unsubscribe = vi.fn()
const subscribe = vi.fn()
const getSubscription = vi.fn()
const getRegistration = vi.fn()
const registerWorker = vi.fn()
const sub = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  toJSON: () => ({ endpoint: 'test' }),
  unsubscribe,
}
const originalWorker = Object.getOwnPropertyDescriptor(
  navigator,
  'serviceWorker',
)
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'B' + 'A'.repeat(86))
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: permission,
  })
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Chrome')
  const worker = { active: true, pushManager: { getSubscription, subscribe } }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration,
      register: registerWorker,
      ready: Promise.resolve(worker),
    },
  })
  getRegistration.mockResolvedValue(worker)
  registerWorker.mockResolvedValue(worker)
  getSubscription.mockResolvedValue(null)
  subscribe.mockResolvedValue(sub)
  unsubscribe.mockResolvedValue(true)
  permission.mockResolvedValue('granted')
  mocks.owns.mockResolvedValue(true)
  mocks.register.mockResolvedValue('id')
  mocks.remove.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  if (originalWorker)
    Object.defineProperty(navigator, 'serviceWorker', originalWorker)
  else Reflect.deleteProperty(navigator, 'serviceWorker')
})
describe('explicit browser push lifecycle', () => {
  it('does not request permission on state reads, only on enable', async () => {
    expect(await pushService.state()).toBe('available')
    expect(permission).not.toHaveBeenCalled()
    await pushService.enable('user')
    expect(permission).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    expect(mocks.register).toHaveBeenCalledWith(sub.toJSON())
  })
  it('detaches browser subscriptions owned by another account before a new opt-in', async () => {
    getSubscription.mockResolvedValue(sub)
    localStorage.setItem('chequecheck-push-owner', 'old')
    await pushService.enable('new')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(localStorage.getItem('chequecheck-push-owner')).toBe('new')
  })
  it('removes durable association before browser unsubscribe and blocks on server failure', async () => {
    getSubscription.mockResolvedValue(sub)
    mocks.remove.mockRejectedValueOnce(new Error('offline'))
    await expect(pushService.disable()).rejects.toThrow('offline')
    expect(unsubscribe).not.toHaveBeenCalled()
    await pushService.disable()
    expect(mocks.remove).toHaveBeenCalledWith(sub.endpoint)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('rolls back the browser subscription on failed durable registration', async () => {
    mocks.register.mockRejectedValueOnce(new Error('device cap'))
    await expect(pushService.enable('user')).rejects.toThrow('device cap')
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('does not subscribe after permission refusal', async () => {
    permission.mockResolvedValue('denied')
    await expect(pushService.enable('user')).rejects.toThrow('permission')
    expect(subscribe).not.toHaveBeenCalled()
  })
  it('reports unconfigured, insecure, denied and iOS install states', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    expect(await pushService.state()).toBe('unconfigured')
    vi.stubGlobal('isSecureContext', false)
    expect(await pushService.state()).toBe('unsupported')
    vi.stubGlobal('isSecureContext', true)
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'B' + 'A'.repeat(86))
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: permission,
    })
    expect(await pushService.state()).toBe('denied')
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone')
    expect(await pushService.state()).toBe('install')
  })
  it('reconciles shared-browser account changes without transferring server ownership', async () => {
    getSubscription.mockResolvedValue(sub)
    localStorage.setItem('chequecheck-push-owner', 'old')
    await pushService.reconcile('new')
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(mocks.register).not.toHaveBeenCalled()
    expect(localStorage.getItem('chequecheck-push-owner')).toBeNull()
  })
  it('skips reconciliation when the service worker has no Push API', async () => {
    getRegistration.mockResolvedValueOnce({})
    await expect(pushService.reconcile(null)).resolves.toBeUndefined()
    expect(mocks.owns).not.toHaveBeenCalled()
    expect(unsubscribe).not.toHaveBeenCalled()
  })
})
