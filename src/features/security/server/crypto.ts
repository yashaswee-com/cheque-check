import { pbkdf2, randomBytes, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { pinSchema } from '../validators/security'
const derive = promisify(pbkdf2)
export const PIN_ITERATIONS = 600000
export function randomSecret() {
  return randomBytes(32).toString('hex')
}
export function proofDigest(proof: string) {
  return createHash('sha256').update(proof).digest('hex')
}
export async function pinDigest(pin: string, salt: string) {
  pinSchema.parse(pin)
  if (!/^[0-9a-f]{64}$/.test(salt)) throw new Error('Invalid PIN salt')
  return (
    await derive(pin, Buffer.from(salt, 'hex'), PIN_ITERATIONS, 32, 'sha256')
  ).toString('hex')
}
