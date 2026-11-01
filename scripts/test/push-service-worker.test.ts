// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker(windows: unknown[] = []) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const show = vi.fn().mockResolvedValue(undefined)
  const open = vi.fn().mockResolvedValue(undefined)
  runInNewContext(
    readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8'),
    {
      self: {
        addEventListener: (name: string, fn: (event: unknown) => void) => {
          handlers[name] = fn
        },
        registration: { showNotification: show },
        location: { origin: 'https://app.test' },
      },
      clients: {
        matchAll: vi.fn().mockResolvedValue(windows),
        openWindow: open,
      },
      URL,
      console,
    },
  )
  return { handlers, show, open }
}
describe('private push service worker', () => {
  it('ignores sensitive message text and renders a generic localized notification', async () => {
    const w = worker()
    const wait = vi.fn()
    w.handlers.push({
      data: {
        json: () => ({
          language: 'en',
          inboxId: '3',
          body: 'Private amount 100',
          url: 'https://evil.test',
        }),
      },
      waitUntil: wait,
    })
    await wait.mock.calls[0][0]
    expect(w.show).toHaveBeenCalledWith(
      'ChequeCheck',
      expect.objectContaining({
        body: 'You have a new notification. Open the app to view it.',
        tag: 'inbox-3',
        data: { url: '/notifications' },
      }),
    )
  })
  it('click focuses only same-origin windows and uses a fixed inbox destination', async () => {
    const own = {
      url: 'https://app.test/cheques',
      navigate: vi.fn().mockResolvedValue(undefined),
      focus: vi.fn().mockResolvedValue(undefined),
    }
    const foreign = {
      url: 'https://evil.test',
      navigate: vi.fn(),
      focus: vi.fn(),
    }
    const w = worker([foreign, own])
    const wait = vi.fn()
    const close = vi.fn()
    w.handlers.notificationclick({
      notification: { close, data: { url: 'https://evil.test' } },
      waitUntil: wait,
    })
    await wait.mock.calls[0][0]
    expect(close).toHaveBeenCalledOnce()
    expect(own.navigate).toHaveBeenCalledWith('https://app.test/notifications')
    expect(own.focus).toHaveBeenCalledOnce()
    expect(foreign.navigate).not.toHaveBeenCalled()
  })
  it('opens the app inbox if no app window exists', async () => {
    const w = worker()
    const wait = vi.fn()
    w.handlers.notificationclick({
      notification: { close: vi.fn() },
      waitUntil: wait,
    })
    await wait.mock.calls[0][0]
    expect(w.open).toHaveBeenCalledWith('https://app.test/notifications')
  })
})
