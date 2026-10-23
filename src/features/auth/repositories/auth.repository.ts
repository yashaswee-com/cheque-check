import {
  Provider,
  SupabaseClient,
  type AuthChangeEvent,
  type Session,
} from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type {
  PhoneAuthFailure,
  PhoneOtpSendInput,
  PhoneOtpSendResult,
  PhoneOtpVerifyInput,
  PhoneOtpVerifyResult,
} from '@/features/auth/phone-auth.types'

export interface IAuthRepository {
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): ReturnType<SupabaseClient['auth']['onAuthStateChange']>
  loginWithPassword(
    email: string,
    password: string,
  ): ReturnType<SupabaseClient['auth']['signInWithPassword']>
  signupWithPassword(
    email: string,
    password: string,
    name: string,
  ): ReturnType<SupabaseClient['auth']['signUp']>
  loginWithOAuth(
    provider: Provider,
    redirectTo: string,
  ): ReturnType<SupabaseClient['auth']['signInWithOAuth']>
  sendPhoneOtp(input: PhoneOtpSendInput): Promise<PhoneOtpSendResult>
  verifyPhoneOtp(input: PhoneOtpVerifyInput): Promise<PhoneOtpVerifyResult>
  signOut(): ReturnType<SupabaseClient['auth']['signOut']>
  resetPassword(
    email: string,
    redirectTo: string,
  ): ReturnType<SupabaseClient['auth']['resetPasswordForEmail']>
  getSession(): ReturnType<SupabaseClient['auth']['getSession']>
  getUser(): ReturnType<SupabaseClient['auth']['getUser']>
}

async function postPhoneAuth<T extends { ok: boolean }>(
  path: string,
  body: unknown,
): Promise<T | PhoneAuthFailure> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const parsed = (await response.json()) as T | PhoneAuthFailure
    if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed
  } catch {
    // Network failure or a non-JSON gateway response.
  }
  return { ok: false, status: 503, code: 'provider_unavailable' }
}

export class SupabaseAuthRepository implements IAuthRepository {
  private readonly supabase = createClient()

  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ) {
    return this.supabase.auth.onAuthStateChange(callback)
  }

  loginWithPassword(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password })
  }

  signupWithPassword(email: string, password: string, name: string) {
    return this.supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
  }

  loginWithOAuth(provider: Provider, redirectTo: string) {
    return this.supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    })
  }

  sendPhoneOtp(input: PhoneOtpSendInput) {
    return postPhoneAuth<Extract<PhoneOtpSendResult, { ok: true }>>(
      '/api/auth/phone/send',
      input,
    )
  }

  verifyPhoneOtp(input: PhoneOtpVerifyInput) {
    return postPhoneAuth<Extract<PhoneOtpVerifyResult, { ok: true }>>(
      '/api/auth/phone/verify',
      input,
    )
  }

  signOut() {
    return this.supabase.auth.signOut()
  }

  resetPassword(email: string, redirectTo: string) {
    return this.supabase.auth.resetPasswordForEmail(email, { redirectTo })
  }

  getSession() {
    return this.supabase.auth.getSession()
  }

  getUser() {
    return this.supabase.auth.getUser()
  }
}
