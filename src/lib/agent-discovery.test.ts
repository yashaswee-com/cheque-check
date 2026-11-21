import { describe, expect, it } from 'vitest'
import { agenticResourceManifest, llmsText } from './agent-discovery'
import { SITE_URL } from './seo'

describe('agent discovery resources', () => {
  it('publishes a useful llms.txt document with an H1 and links', async () => {
    const document = await llmsText()
    expect(document).toMatch(/^# Cheque Check\n/u)
    expect(document).toContain(`[Homepage](${SITE_URL}/)`)
    expect(document).toContain(`[Article index](${SITE_URL}/en/articles)`)
    expect(document).not.toContain('/dashboard')
  })

  it('publishes only schema-compliant public ARD entries', () => {
    const manifest = agenticResourceManifest()
    expect(manifest.entries).toHaveLength(2)
    for (const entry of manifest.entries) {
      expect(entry.identifier).toMatch(/^urn:air:chequecheck\.in:/u)
      expect(entry.displayName).toBeTruthy()
      expect(entry.type).toMatch(/^[\w.+-]+\/[\w.+-]+$/u)
      expect(entry.url.startsWith(`${SITE_URL}/`)).toBe(true)
      expect(entry).not.toHaveProperty('data')
      expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2)
    }
  })
})
