import { NOTIFICATION_PURPOSE } from '../../_shared/notifications.ts'
import { Logger } from '../../_shared/logger.ts'
import type { ClaimedJob, DispatchCheque, DispatchResult } from '../types.ts'
import {
  renderVoiceReminderMessage,
  renderVoiceSampleMessage,
} from './voice-message.ts'
import type {
  ChannelDispatchContext,
  NotificationChannelHandler,
  TestModeConfig,
  VoiceDeliveryPort,
  VoiceProviderPort,
} from './channel.types.ts'

const E164_PATTERN = /^\+[1-9]\d{6,14}$/

export class VoiceNotificationHandler implements NotificationChannelHandler {
  constructor(
    private readonly db: VoiceDeliveryPort,
    private readonly voice: VoiceProviderPort | null,
    private readonly testMode: TestModeConfig,
  ) {}

  async dispatch(
    job: ClaimedJob,
    context: ChannelDispatchContext,
  ): Promise<DispatchResult> {
    if (!this.voice) throw new Error('Voice provider configuration unavailable')
    const profile = await this.db.fetchProfile(job.user_id)
    if (!profile || profile.deleted_at)
      return context.skip(job, 'User account is unavailable')

    const recipient = job.payload.to_override || profile.phone
    if (!recipient) return context.skip(job, 'Profile has no phone number')
    if (!E164_PATTERN.test(recipient))
      return context.skip(
        job,
        'Recipient phone number is not a valid E.164 number',
      )

    const isSample = job.purpose === NOTIFICATION_PURPOSE.SAMPLE_VOICE_TEST
    if (!profile.voice_call_enabled)
      return context.skip(job, 'Voice reminders are turned off')

    let cheques: DispatchCheque[] = []
    if (!isSample) {
      if (
        !job.business_id ||
        !(await this.db.isBusinessActive(job.business_id, job.user_id))
      )
        return context.skip(job, 'Business is unavailable')
      cheques = await this.db.fetchCheques(
        job.payload.cheque_ids ?? [],
        job.business_id,
      )
      if (cheques.length === 0)
        return context.skip(job, 'No active cheques remain for this reminder')
    }

    const language = profile.language || 'en'
    const message = isSample
      ? renderVoiceSampleMessage(profile.name || 'User', language)
      : renderVoiceReminderMessage(
          profile.name || 'User',
          cheques,
          language,
          profile.currency,
        )
    const twiml = this.voice.generateTwiML(message, language)
    const to = this.testMode.enabled ? this.testMode.phone : recipient

    context.state.providerStarted = true
    const admission = await this.db.startDelivery(job, to)
    if (admission.status === 'throttled') {
      context.state.providerStarted = false
      context.metrics.provider_throttled++
      return {
        jobId: job.id,
        status: 'queued',
        error: 'Provider capacity unavailable; queued',
      }
    }
    if (admission.status === 'quota_exhausted') {
      context.state.providerStarted = false
      return context.skip(job, 'Voice reminder quota exhausted')
    }
    if (Date.now() >= admission.startBefore) {
      await context.finalize(
        job,
        'rejected',
        undefined,
        'Provider admission expired before request',
      )
      return {
        jobId: job.id,
        status: 'failed',
        error: 'Provider admission expired before request',
      }
    }

    context.metrics.provider_requests++
    const providerStarted = Date.now()
    const call = await this.voice.initiateCall(to, twiml).finally(() => {
      context.metrics.provider_duration_ms += Date.now() - providerStarted
    })

    if (call.success) {
      context.metrics.provider_accepted++
      Logger.info(`Provider accepted job ${job.id}`, { sid: call.sid })
      const result = await this.accept(job, call.sid, context)
      Logger.info(`Voice call sent for job ${job.id}`, { sid: call.sid })
      return result
      return this.accept(job, call.sid, context)
    }

    const errorMessage = call.error || 'Twilio call failed'
    if (call.uncertain) context.metrics.provider_uncertain++
    else context.metrics.provider_rejected++
    await context.finalize(
      job,
      call.uncertain ? 'uncertain' : 'rejected',
      undefined,
      errorMessage,
    )
    if (call.uncertain) context.metrics.reconciliation_required++
    Logger.error(`Voice call failed for job ${job.id}`, errorMessage)
    return { jobId: job.id, status: 'failed', error: errorMessage }
  }

  private async accept(
    job: ClaimedJob,
    providerId: string | undefined,
    context: ChannelDispatchContext,
  ): Promise<DispatchResult> {
    await context.finalize(job, 'accepted', providerId)
    return { jobId: job.id, status: 'sent', providerMessageId: providerId }
  }
}
