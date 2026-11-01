export type {
  SecurityStatus,
  SecurityAction,
  PinResult,
} from './validators/security'
export class SecurityError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'SecurityError'
  }
}
