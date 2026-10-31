import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createChequePrintPdf,
  defaultPrintLayout,
  getPrintLayout,
  savePrintLayout,
} from './print-cheque'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('print-cheque', () => {
  const cheque = {
    account_id: 'account-1',
    cheque_number: '123456',
    amount: 12500,
    cheque_date: '2026-09-30',
    party: { name: 'Acme Ltd' },
  }

  it('uses defaults and creates an A4 PDF', () => {
    const document = createChequePrintPdf(cheque, '₹')
    expect(document.internal.pageSize.getWidth()).toBeCloseTo(210)
    expect(document.internal.pageSize.getHeight()).toBeCloseTo(297)
  })

  it('returns defaults during server rendering without accessing browser storage', () => {
    vi.stubGlobal('window', undefined)
    expect(getPrintLayout('account-1')).toBe(defaultPrintLayout)
  })

  it('prints an empty payee when the party relation is unavailable', () => {
    const document = createChequePrintPdf({ ...cheque, party: undefined }, '₹')
    expect(document.internal.pageSize.getWidth()).toBeCloseTo(210)
    expect(document.output()).not.toContain('Acme Ltd')
    expect(document.output()).toContain('123456')
    expect(document.output()).toContain('2026-09-30')
  })

  it('persists account-specific layout coordinates', () => {
    const layout = { ...defaultPrintLayout, payeeX: 42 }
    savePrintLayout('account-1', layout)
    expect(getPrintLayout('account-1')).toEqual(layout)
  })

  it('falls back to default coordinates for corrupted stored layouts', () => {
    localStorage.setItem('cheque-check:print-layout:account-1', 'invalid json')
    expect(getPrintLayout('account-1')).toEqual(defaultPrintLayout)
  })
})
