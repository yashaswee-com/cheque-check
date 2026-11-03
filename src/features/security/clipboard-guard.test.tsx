import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CLIPBOARD_GUARD_ATTRIBUTE,
  ClipboardGuard,
} from './components/clipboard-guard'

afterEach(cleanup)

function fire(type: 'copy' | 'cut' | 'paste', target: Element) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function mount() {
  return render(
    <div>
      <ClipboardGuard />
      <p data-testid="text">Balance 1,25,000</p>
      <input data-testid="input" />
      <input data-testid="readonly" readOnly />
      <textarea data-testid="textarea" />
      <div
        data-testid="editable"
        contentEditable
        suppressContentEditableWarning
      >
        <span data-testid="editable-child">x</span>
      </div>
    </div>,
  )
}

describe('ClipboardGuard', () => {
  it('blocks copying and cutting anywhere, including form fields', () => {
    const view = mount()
    for (const id of ['text', 'input', 'textarea'])
      for (const type of ['copy', 'cut'] as const)
        expect(fire(type, view.getByTestId(id))).toBe(true)
  })

  it('allows pasting only into editable fields', () => {
    const view = mount()
    expect(fire('paste', view.getByTestId('text'))).toBe(true)
    expect(fire('paste', view.getByTestId('readonly'))).toBe(true)
    expect(fire('paste', view.getByTestId('input'))).toBe(false)
    expect(fire('paste', view.getByTestId('textarea'))).toBe(false)
    expect(fire('paste', view.getByTestId('editable-child'))).toBe(false)
  })

  it('marks the document while mounted and releases everything on unmount', () => {
    const view = mount()
    expect(document.documentElement).toHaveAttribute(CLIPBOARD_GUARD_ATTRIBUTE)
    const text = view.getByTestId('text')
    view.unmount()
    expect(document.documentElement).not.toHaveAttribute(
      CLIPBOARD_GUARD_ATTRIBUTE,
    )
    document.body.appendChild(text)
    expect(fire('copy', text)).toBe(false)
    text.remove()
  })
})
