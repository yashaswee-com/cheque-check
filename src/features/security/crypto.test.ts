// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  pinDigest,
  randomSecret,
  proofDigest,
  PIN_ITERATIONS,
} from './server/crypto'
describe('PIN derivation', () => {
  it('uses the required PBKDF2 work factor and distinct random salts without storing plaintext', async () => {
    const salt = randomSecret(),
      other = randomSecret()
    const digest = await pinDigest('123456', salt)
    expect(PIN_ITERATIONS).toBe(600000)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(await pinDigest('123456', salt)).toBe(digest)
    expect(await pinDigest('123456', other)).not.toBe(digest)
    expect(await pinDigest('654321', salt)).not.toBe(digest)
    expect(proofDigest(salt)).not.toBe(salt)
    await expect(pinDigest('1234', salt)).rejects.toThrow()
    await expect(pinDigest('123456', 'bad')).rejects.toThrow()
  }, 15000)
})
