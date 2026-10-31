import { DispatcherDatabaseService } from '../services/database.service.ts'
import { TwilioVoiceService } from '../../_shared/twilio-voice.service.ts'
import { Logger } from '../../_shared/logger.ts'
import { NOTIFICATION_PURPOSE } from '../../_shared/notifications.ts'
import {
  ClaimedJob,
  DispatchCheque,
  DispatchResult,
  DispatchScope,
} from '../types.ts'

const E164_PATTERN = /^\+[1-9]\d{6,14}$/

export interface TestModeConfig {
  enabled: boolean
  phone: string
}

interface DeliveryMetrics {
  provider_requests: number
  provider_duration_ms: number
  provider_accepted: number
  provider_rejected: number
  provider_uncertain: number
  reconciliation_required: number
  finalization_retries: number
}

export class DispatcherOrchestrator {
  constructor(
    private db: DispatcherDatabaseService,
    private twilio: TwilioVoiceService,
    private testMode: TestModeConfig = { enabled: false, phone: '' },
  ) {}

  /** Without a scope this is the global cron claim; a scope limits the claim itself. */
  async run(batchSize = 50, scope?: DispatchScope): Promise<DispatchResult[]> {
    const results: DispatchResult[] = []
    const started = Date.now()
    const deadline = started + 40_000
    const metrics: DeliveryMetrics = {
      provider_requests: 0,
      provider_duration_ms: 0,
      provider_accepted: 0,
      provider_rejected: 0,
      provider_uncertain: 0,
      reconciliation_required: 0,
      finalization_retries: 0,
    }
    let claims = 0
    let stopReason = 'max_jobs'
    let failed = true
    try {
      // Claim only what can start immediately; queued-in-memory jobs would age their leases.
      for (
        let remaining = batchSize;
        remaining > 0 && Date.now() < deadline;
        remaining -= 5
      ) {
        const jobs = await this.db.claimJobs(Math.min(5, remaining), scope)
        claims++
        if (!jobs.length) {
          stopReason = 'empty_queue'
          break
        }
        results.push(
          ...(await Promise.all(
            jobs.map((job) => this.dispatchSafely(job, metrics)),
          )),
        )
        if (jobs.length < Math.min(5, remaining)) {
          stopReason = 'empty_queue'
          break
        }
      }
      if (
        Date.now() >= deadline &&
        results.length < batchSize &&
        stopReason !== 'empty_queue'
      )
        stopReason = 'budget'
      failed = false
      return results
    } finally {
      Logger.metric('notification.dispatcher.run', {
        ...metrics,
        duration_ms: Date.now() - started,
        claims,
        processed: results.length,
        sent: results.filter((result) => result.status === 'sent').length,
        skipped: results.filter((result) => result.status === 'skipped').length,
        failed_jobs: results.filter((result) => result.status === 'failed')
          .length,
        failed,
        scoped: !!scope,
        stop_reason: failed ? 'error' : stopReason,
      })
    }
  }

  /** Pre-provider failures retry; started deliveries recover through their lease. */
  private async dispatchSafely(
    job: ClaimedJob,
    metrics: DeliveryMetrics,
  ): Promise<DispatchResult> {
    const state = { providerStarted: false }
    try {
      return await this.dispatch(job, state, metrics)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      Logger.error(`Dispatch crashed for job ${job.id}`, message)
      if (!state.providerStarted) await this.db.markFailedOrRetry(job, message)
      else metrics.reconciliation_required++
      // Started deliveries retain their reservation and cannot be blindly retried.
      // The lease reaper exposes them for provider reconciliation.
      return { jobId: job.id, status: 'failed', error: message }
    }
  }

  private async skip(job: ClaimedJob, reason: string): Promise<DispatchResult> {
    await this.db.markSkipped(job, reason)
    return { jobId: job.id, status: 'skipped', error: reason }
  }

  private async dispatch(
    job: ClaimedJob,
    state: { providerStarted: boolean },
    metrics: DeliveryMetrics,
  ): Promise<DispatchResult> {
    if (job.channel !== 'voice') {
      await this.db.markSkipped(
        job,
        `channel '${job.channel}' is not implemented yet`,
      )
      return { jobId: job.id, status: 'skipped' }
    }

    return this.dispatchVoice(job, state, metrics)
  }

  private async dispatchVoice(
    job: ClaimedJob,
    state: { providerStarted: boolean },
    metrics: DeliveryMetrics,
  ): Promise<DispatchResult> {
    const profile = await this.db.fetchProfile(job.user_id)
    if (!profile || profile.deleted_at) {
      return this.skip(job, 'User account is unavailable')
    }
    const recipient = job.payload.to_override || profile.phone
    if (!recipient) return this.skip(job, 'Profile has no phone number')
    if (!E164_PATTERN.test(recipient)) {
      return this.skip(
        job,
        'Recipient phone number is not a valid E.164 number',
      )
    }

    const isSample = job.purpose === NOTIFICATION_PURPOSE.SAMPLE_VOICE_TEST
    if (!profile.voice_call_enabled) {
      return this.skip(job, 'Voice reminders are turned off')
    }

    let cheques: DispatchCheque[] = []
    if (!isSample) {
      if (
        !job.business_id ||
        !(await this.db.isBusinessActive(job.business_id, job.user_id))
      ) {
        return this.skip(job, 'Business is unavailable')
      }
      cheques = await this.db.fetchCheques(
        job.payload.cheque_ids ?? [],
        job.business_id,
      )
      if (cheques.length === 0) {
        return this.skip(job, 'No active cheques remain for this reminder')
      }
    }

    const language = profile.language || 'en'
    const message = isSample
      ? this.buildSampleMessage(profile.name || 'User', language)
      : this.buildMessage(profile.name || 'User', cheques, language)
    const twiml = this.twilio.generateTwiML(message, language)
    const to = this.testMode.enabled ? this.testMode.phone : recipient
    // Set before awaiting: a lost database response may already have reserved a credit.
    state.providerStarted = true
    const hasQuota = await this.db.startDelivery(job, to)
    if (!hasQuota) {
      state.providerStarted = false
      return this.skip(job, 'Voice reminder quota exhausted')
    }

    metrics.provider_requests++
    const providerStarted = Date.now()
    const call = await this.twilio.initiateCall(to, twiml).finally(() => {
      metrics.provider_duration_ms += Date.now() - providerStarted
    })

    if (call.success) {
      metrics.provider_accepted++
      Logger.info(`Provider accepted job ${job.id}`, { sid: call.sid })
      await this.finalize(job, metrics, 'accepted', call.sid)
      Logger.info(`Voice call sent for job ${job.id}`, { sid: call.sid })
      return { jobId: job.id, status: 'sent', providerMessageId: call.sid }
    }

    const errorMessage = call.error || 'Twilio call failed'
    if (call.uncertain) {
      metrics.provider_uncertain++
    } else metrics.provider_rejected++
    await this.finalize(
      job,
      metrics,
      call.uncertain ? 'uncertain' : 'rejected',
      undefined,
      errorMessage,
    )
    if (call.uncertain) metrics.reconciliation_required++
    Logger.error(`Voice call failed for job ${job.id}`, errorMessage)
    return { jobId: job.id, status: 'failed', error: errorMessage }
  }

  private async finalize(
    job: ClaimedJob,
    metrics: DeliveryMetrics,
    outcome: 'accepted' | 'rejected' | 'uncertain',
    providerId?: string,
    message?: string,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.db.finishDelivery(job, outcome, providerId, message)
        return
      } catch (error) {
        Logger.error(`Delivery finalization failed for ${job.id}`, error)
        if (attempt === 2) throw error
        metrics.finalization_retries++
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
      }
    }
  }

  private buildMessage(
    name: string,
    cheques: DispatchCheque[],
    language: string,
  ): string {
    const banks: Record<string, { count: number; total: number }> = {}
    cheques.forEach((cheque) => {
      const bankName = cheque.account?.bank?.name || 'Unknown Bank'
      if (!banks[bankName]) banks[bankName] = { count: 0, total: 0 }
      banks[bankName].count++
      banks[bankName].total += Number(cheque.amount)
    })

    if (language === 'hi') {
      const bankSummaries = Object.entries(banks)
        .map(
          ([bank, data]) =>
            `${bank} में ${data.total} रुपये के ${data.count} चेक`,
        )
        .join(', और ')

      return `नमस्ते ${name}, यह चेक चेक की तरफ से एक रिमाइंडर है। आज आपके ${bankSummaries} आ रहे हैं। कृपया सुनिश्चित करें कि आपके बैंक खाते में पर्याप्त बैलेंस है।`
    }

    const bankSummaries = Object.entries(banks)
      .map(
        ([bank, data]) =>
          `${data.count} cheque${data.count > 1 ? 's' : ''} hitting ${bank} for a total of ${data.total}`,
      )
      .join(', and ')

    return `Hello ${name}, this is a reminder from Cheque Check. You have ${bankSummaries} today. Please ensure your accounts are sufficiently funded.`
  }

  private buildSampleMessage(name: string, language: string): string {
    if (language === 'hi') {
      return `नमस्ते ${name}, यह चेक चेक की तरफ से एक टेस्ट कॉल है। अगर आपने यह कॉल सुनी, तो आपकी वॉइस रिमाइंडर सेटिंग सही से काम कर रही है।`
    }

    return `Hello ${name}, this is a test call from Cheque Check. If you can hear this, your Voice Reminder setup is working correctly.`
  }
}
