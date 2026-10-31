import { afterEach, describe, expect, it } from 'vitest'
import { ScanStore } from './scan-store'
afterEach(() => ScanStore.getFile())

describe('ScanStore', () => {
  it('peeks without consuming and returns a pending scan exactly once', () => {
    expect(ScanStore.hasFile()).toBe(false)
    expect(ScanStore.getFile()).toBeNull()
    const file = new File(['scan'], 'cheque.png')
    ScanStore.setFile(file)
    expect(ScanStore.hasFile()).toBe(true)
    expect(ScanStore.hasFile()).toBe(true)
    expect(ScanStore.getFile()).toBe(file)
    expect(ScanStore.hasFile()).toBe(false)
    expect(ScanStore.getFile()).toBeNull()
  })

  it('replaces an unconsumed scan with the most recently selected file', () => {
    ScanStore.setFile(new File(['old'], 'old.png'))
    const latest = new File(['new'], 'new.png')
    ScanStore.setFile(latest)
    expect(ScanStore.getFile()).toBe(latest)
  })
})
