import type { Provider } from '@supabase/supabase-js'
import type {
  PhoneOtpSendInput,
  PhoneOtpVerifyInput,
} from '@/features/auth/phone-auth.types'
import {
  IAuthRepository,
  SupabaseAuthRepository,
} from '@/features/auth/repositories/auth.repository'

let defaultAuthService: AuthService | undefined

function getDefaultAuthService(): AuthService {
  if (!defaultAuthService) defaultAuthService = new AuthService()
  return defaultAuthService
}

export class AuthService {
  constructor(
    private readonly repository: IAuthRepository = new SupabaseAuthRepository(),
  ) {}

  loginWithPassword(email: string, password: string) {
    return this.repository.loginWithPassword(email, password)
  }

  signupWithPassword(email: string, password: string, name: string) {
    return this.repository.signupWithPassword(email, password, name)
  }

  loginWithOAuth(provider: Provider) {
    return this.repository.loginWithOAuth(
      provider,
      `${window.location.origin}/auth/callback`,
    )
  }

  sendPhoneOtp(input: PhoneOtpSendInput) {
    return this.repository.sendPhoneOtp(input)
  }

  verifyPhoneOtp(input: PhoneOtpVerifyInput) {
    return this.repository.verifyPhoneOtp(input)
  }

  signOut() {
    return this.repository.signOut()
  }

  resetPassword(email: string) {
    return this.repository.resetPassword(
      email,
      `${window.location.origin}/auth/callback?next=/settings/password`,
    )
  }

  getSession() {
    return this.repository.getSession()
  }

  onAuthStateChange(
    callback: Parameters<IAuthRepository['onAuthStateChange']>[0],
  ) {
    return this.repository.onAuthStateChange(callback)
  }

  async getUser() {
    const {
      data: { user },
      error,
    } = await this.repository.getUser()
    if (error && error.name !== 'AuthSessionMissingError') throw error
    return user
  }
}

export const authService: AuthService = new Proxy(
  Object.create(AuthService.prototype),
  {
    get(_target, property, receiver) {
      const service = getDefaultAuthService()
      const value = Reflect.get(service, property, receiver)
      return typeof value === 'function' ? value.bind(service) : value
    },
  },
)
