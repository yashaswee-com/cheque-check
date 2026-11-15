import type {
  BrowserSubscription,
  PushOutcome,
} from '../../_shared/web-push.service.ts'
import type {
  ClaimedJob,
  DeliveryAdmission,
  DispatchAttemptState,
  DispatchCheque,
  DispatchProfile,
  DispatchResult,
  DeliveryMetrics,
} from '../types.ts'

export interface VoiceProviderPort {
  generateTwiML(message: string, language?: string): string
  initiateCall(
    to: string,
    twiml: string,
  ): Promise<{
    success: boolean
    sid?: string
    error?: string
    uncertain?: boolean
  }>
}

export interface VoiceDeliveryPort {
  fetchProfile(userId: string): Promise<DispatchProfile | null>
  isBusinessActive(businessId: string, userId: string): Promise<boolean>
  fetchCheques(
    chequeIds: string[],
    businessId: string,
  ): Promise<DispatchCheque[]>
  startDelivery(job: ClaimedJob, recipient: string): Promise<DeliveryAdmission>
  finishDelivery(
    job: ClaimedJob,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ): Promise<void>
  markSkipped(job: ClaimedJob, reason: string): Promise<void>
}

export interface PushProviderPort {
  deliver(
    subscription: BrowserSubscription,
    inboxId: string,
    language: string | null,
  ): Promise<PushOutcome>
}

export interface PushDeliveryPort {
  fetchProfile(userId: string): Promise<DispatchProfile | null>
  startPushDelivery(job: ClaimedJob): Promise<
    | { status: 'throttled' }
    | { status: 'skipped' }
    | {
        status: 'started'
        startBefore: number
        subscription: BrowserSubscription
      }
  >
  finishPushDelivery(job: ClaimedJob, result: PushOutcome): Promise<void>
  markSkipped(job: ClaimedJob, reason: string): Promise<void>
}

export interface ChannelDispatchContext {
  state: DispatchAttemptState
  metrics: DeliveryMetrics
  skip(job: ClaimedJob, reason: string): Promise<DispatchResult>
  finalize(
    job: ClaimedJob,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ): Promise<void>
}

export interface NotificationChannelHandler {
  dispatch(
    job: ClaimedJob,
    context: ChannelDispatchContext,
  ): Promise<DispatchResult>
}

export interface TestModeConfig {
  enabled: boolean
  phone: string
}
