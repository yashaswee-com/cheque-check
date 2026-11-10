import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  document.documentElement.lang = 'en'
})

function page(language = 'en', pathname = '/cheques') {
  const html = new DOMParser().parseFromString(
    readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8'),
    'text/html',
  )
  document.body.innerHTML = html.body.innerHTML
  const navigator = { language, onLine: false }
  const handlers: Record<string, () => void> = {}
  const location = { pathname, reload: vi.fn(), replace: vi.fn() }
  runInNewContext(
    readFileSync(join(process.cwd(), 'public/offline.js'), 'utf8'),
    {
      document,
      navigator,
      window: {
        location,
        addEventListener: (name: string, handler: () => void) => {
          handlers[name] = handler
        },
      },
    },
  )
  return { navigator, handlers, location }
}

describe('standalone offline page', () => {
  it('shows accessible offline guidance without app JavaScript or user data', () => {
    page()
    expect(screen.getByRole('main')).toHaveAccessibleName("You're offline")
    expect(screen.getByRole('status')).toHaveTextContent(
      'No network connection',
    )
    expect(
      screen.getByText(/account and cheque data are not stored/),
    ).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeVisible()
  })

  it('announces reconnect and disconnect without automatic navigation', () => {
    const p = page()
    p.navigator.onLine = true
    p.handlers.online()
    expect(screen.getByRole('status')).toHaveTextContent('Press Retry')
    expect(p.location.reload).not.toHaveBeenCalled()
    expect(p.location.replace).not.toHaveBeenCalled()
    p.navigator.onLine = false
    p.handlers.offline()
    expect(screen.getByRole('status')).toHaveTextContent(
      'No network connection',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(p.location.reload).toHaveBeenCalledOnce()
  })

  it('defaults to Hindi and switches all copy to Hinglish and English without storage', () => {
    page('hi-IN')
    expect(document.documentElement.lang).toBe('hi')
    expect(screen.getByRole('heading')).toHaveTextContent('आप ऑफ़लाइन हैं')
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'hi-en' } })
    expect(document.documentElement.lang).toBe('en')
    expect(screen.getByRole('heading')).toHaveTextContent('Aap offline hain')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Network connection nahi hai',
    )
    fireEvent.change(select, { target: { value: 'en' } })
    expect(screen.getByRole('heading')).toHaveTextContent("You're offline")
    expect(document.title).toBe("You're offline | ChequeCheck")
  })

  it('returns to the public homepage for a direct fallback-page visit', () => {
    const p = page('en', '/offline.html')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(p.location.replace).toHaveBeenCalledWith('/')
    expect(p.location.reload).not.toHaveBeenCalled()
  })
})
