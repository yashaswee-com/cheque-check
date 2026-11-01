// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { version } from '../../package.json'
describe('settings application version', () => {
  it('renders the package version directly below sign out rather than a duplicated literal', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
    const source = readFileSync(
      join(process.cwd(), 'src', 'app', '(dashboard)', 'settings', 'page.tsx'),
      'utf8',
    )
    expect(source).toContain('ChequeCheck v{version}')
    expect(source.indexOf('ChequeCheck v{version}')).toBeGreaterThan(
      source.indexOf('settings-logout-button'),
    )
  })
})
