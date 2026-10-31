import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnstileWidget } from './turnstile-widget'

const SCRIPT_ID = 'cf-turnstile-script'

type RenderOptions = {
  sitekey: string
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

function installTurnstile(
  renderWidget = vi.fn(
    (_element: HTMLElement, _options: RenderOptions) => 'widget-1',
  ),
) {
  const remove = vi.fn()
  Object.defineProperty(window, 'turnstile', {
    configurable: true,
    value: { render: renderWidget, remove },
  })
  return { renderWidget, remove }
}

afterEach(() => {
  cleanup()
  delete (window as Window & { turnstile?: unknown }).turnstile
  document.getElementById(SCRIPT_ID)?.remove()
})

describe('TurnstileWidget', () => {
  it('renders the challenge and forwards token, expiry, and error callbacks', async () => {
    const { renderWidget, remove } = installTurnstile()
    const onToken = vi.fn()
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key" onToken={onToken} />,
    )

    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
    const options = renderWidget.mock.calls[0][1]
    expect(options.sitekey).toBe('site-key')

    options.callback('token-1')
    options['expired-callback']()
    options['error-callback']()
    expect(onToken.mock.calls).toEqual([['token-1'], [null], [null]])

    unmount()
    expect(remove).toHaveBeenCalledWith('widget-1')
  })

  it('uses the latest callback without recreating the provider widget', async () => {
    const { renderWidget } = installTurnstile()
    const firstCallback = vi.fn()
    const latestCallback = vi.fn()
    const { rerender } = render(
      <TurnstileWidget siteKey="site-key" onToken={firstCallback} />,
    )
    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())

    rerender(<TurnstileWidget siteKey="site-key" onToken={latestCallback} />)
    renderWidget.mock.calls[0][1].callback('fresh-token')

    expect(firstCallback).not.toHaveBeenCalled()
    expect(latestCallback).toHaveBeenCalledWith('fresh-token')
    expect(renderWidget).toHaveBeenCalledOnce()
  })

  it('loads the script once and renders after it becomes available', async () => {
    const renderWidget = vi.fn(
      (_element: HTMLElement, _options: RenderOptions) => 'loaded-widget',
    )
    const remove = vi.fn()
    const onToken = vi.fn()
    const { container } = render(
      <TurnstileWidget siteKey="site-key" onToken={onToken} />,
    )

    const script = document.getElementById(SCRIPT_ID)
    expect(script).not.toBeNull()
    expect((script as HTMLScriptElement).src).toContain(
      'challenges.cloudflare.com/turnstile',
    )
    Object.defineProperty(window, 'turnstile', {
      configurable: true,
      value: { render: renderWidget, remove },
    })
    fireEvent.load(script as HTMLScriptElement)

    await waitFor(() => expect(renderWidget).toHaveBeenCalledOnce())
    expect(renderWidget.mock.calls[0][0]).toBe(
      container.querySelector('[data-testid="turnstile-widget"]'),
    )
  })

  it('clears the token when script loading fails', async () => {
    const onToken = vi.fn()
    render(<TurnstileWidget siteKey="site-key" onToken={onToken} />)

    fireEvent.error(document.getElementById(SCRIPT_ID) as HTMLScriptElement)

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null))
  })

  it('does not render a widget when unmounted before the script loads', async () => {
    const renderWidget = vi.fn(
      (_element: HTMLElement, _options: RenderOptions) => 'unused',
    )
    const onToken = vi.fn()
    const { unmount } = render(
      <TurnstileWidget siteKey="site-key" onToken={onToken} />,
    )
    const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement

    unmount()
    Object.defineProperty(window, 'turnstile', {
      configurable: true,
      value: { render: renderWidget, remove: vi.fn() },
    })
    fireEvent.load(script)
    await Promise.resolve()

    expect(renderWidget).not.toHaveBeenCalled()
  })
})
